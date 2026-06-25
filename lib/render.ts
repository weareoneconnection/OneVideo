import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { db } from "./db";
import { ensureProjectPublicDir, getProjectPublicUrl } from "./file-storage";
import { createPackagingAssets } from "./packaging";
import { publishProjectFile } from "./storage-provider";
import { generateSpeech } from "./tts-provider";

const execFileAsync = promisify(execFile);

type RenderSceneItem = {
  id: string;
  sceneIndex: number;
  durationSeconds: number;
  voiceover: string | null;
  storyBeat: string | null;
  status: string;
  videoUrl: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function getRenderSize(aspectRatio: string) {
  if (aspectRatio === "16:9") {
    return {
      width: 1280,
      height: 720
    };
  }

  if (aspectRatio === "1:1") {
    return {
      width: 1024,
      height: 1024
    };
  }

  return {
    width: 720,
    height: 1280
  };
}

async function getFileSize(filePath: string) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return undefined;
  }
}

async function assertFfmpegAvailable() {
  try {
    await execFileAsync(getFfmpegPath(), ["-version"]);
  } catch {
    throw new Error("FFmpeg is not available. Install ffmpeg or set FFMPEG_PATH to render final MP4.");
  }
}

async function downloadToFile(url: string, filePath: string) {
  if (url.startsWith("/")) {
    const sourcePath = path.join(process.cwd(), "public", url);
    if (sourcePath !== filePath) {
      await copyFile(sourcePath, filePath);
      return filePath;
    }

    return sourcePath;
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download clip: HTTP ${res.status} ${res.statusText}`);
  }

  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(filePath));
  return filePath;
}

function buildConcatFilter(clipCount: number, aspectRatio: string) {
  const { width, height } = getRenderSize(aspectRatio);
  const normalizedClips = Array.from({ length: clipCount }, (_, index) => {
    return `[${index}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${index}]`;
  });
  const concatInputs = Array.from({ length: clipCount }, (_, index) => `[v${index}]`).join("");

  return `${normalizedClips.join(";")};${concatInputs}concat=n=${clipCount}:v=1:a=0[vout]`;
}

export async function runRenderWorkflow(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: {
      id: projectId
    },
    include: {
      scenes: {
        orderBy: {
          sceneIndex: "asc"
        }
      },
      voiceProfile: {
        select: { elevenLabsVoiceId: true }
      }
    }
  });

  const completedScenes = project.scenes.filter(
    (scene: RenderSceneItem) => scene.status === "completed" && scene.videoUrl
  );
  const hasSceneTimeline = project.scenes.length > 0;

  if (hasSceneTimeline && completedScenes.length !== project.scenes.length) {
    await db.project.update({
      where: {
        id: projectId
      },
      data: {
        status: "partial_failed",
        errorMessage: "Render skipped because not all scene clips are completed."
      }
    });

    return null;
  }

  if (!hasSceneTimeline && !project.finalVideoUrl) {
    await db.project.update({
      where: {
        id: projectId
      },
      data: {
        status: "partial_failed",
        errorMessage: "Render skipped because no scene clips or source video are available."
      }
    });

    return null;
  }

  try {
    await assertFfmpegAvailable();
  } catch (error) {
    await db.project.update({
      where: {
        id: projectId
      },
      data: {
        status: "completed_clips",
        progress: 90,
        errorMessage: getErrorMessage(error)
      }
    });

    return null;
  }

  await db.project.update({
    where: {
      id: projectId
    },
    data: {
      status: "rendering",
      progress: 94,
      errorMessage: null
    }
  });

  const startedAt = new Date();
  const startedMs = Date.now();
  const dir = await ensureProjectPublicDir(projectId);
  const script: any = project.scriptJson || {};
  const voiceoverText =
    script.fullVoiceover ||
    [script.hook, script.body, script.cta].filter(Boolean).join(" ") ||
    completedScenes.map((scene: RenderSceneItem) => scene.voiceover).filter(Boolean).join(" ") ||
    project.topic;

  const speech = await generateSpeech({
    projectId,
    text: voiceoverText,
    durationSeconds: project.durationSeconds,
    language: project.language,
    elevenLabsVoiceId: (project as any).voiceProfile?.elevenLabsVoiceId
  });
  const publishedSpeech = await publishProjectFile({
    projectId,
    filename: "voiceover.mp3",
    localPath: speech.localPath,
    localUrl: speech.url,
    contentType: speech.mimeType
  });
  const packaging = await createPackagingAssets({
    project: {
      id: project.id,
      title: project.title,
      topic: project.topic
    },
    scenes: hasSceneTimeline
  ? completedScenes.map((scene: RenderSceneItem) => ({
      id: scene.id,
      sceneIndex: scene.sceneIndex,
      durationSeconds: scene.durationSeconds,
      voiceover: scene.voiceover || "",
      storyBeat: scene.storyBeat || ""
    }))
  : [
      {
        id: project.id,
        sceneIndex: 1,
        durationSeconds: project.durationSeconds,
        voiceover: String(voiceoverText || ""),
        storyBeat: project.topic || ""
      }
    ]
  });

  await db.asset.upsert({
    where: {
      id: `${projectId}-voiceover`
    },
    update: {
      url: publishedSpeech.url,
      mimeType: speech.mimeType,
      sizeBytes: await getFileSize(speech.localPath),
      metadata: {
        provider: speech.provider,
        model: speech.model,
        storage: publishedSpeech,
        raw: speech.raw || null
      }
    },
    create: {
      id: `${projectId}-voiceover`,
      projectId,
      type: "audio",
      url: publishedSpeech.url,
      mimeType: speech.mimeType,
      sizeBytes: await getFileSize(speech.localPath),
      metadata: {
        provider: speech.provider,
        model: speech.model,
        storage: publishedSpeech,
        raw: speech.raw || null
      }
    }
  });

  const clipSources = hasSceneTimeline
    ? completedScenes.map((scene: RenderSceneItem) => ({
        url: scene.videoUrl!,
        filename: `scene-${scene.sceneIndex}.mp4`
      }))
    : [
        {
          url: project.finalVideoUrl!,
          filename: "legacy-source.mp4"
        }
      ];
  const localClips: string[] = [];

  for (const clip of clipSources) {
    const filePath = path.join(dir, clip.filename);
    localClips.push(await downloadToFile(clip.url, filePath));
  }

  // 等待背景音乐（Suno 异步生成，最多等 90s）
  let musicLocalPath: string | null = null;
  const refreshedProject = await db.project.findUnique({
    where: { id: projectId },
    select: { backgroundMusicUrl: true, musicProvider: true }
  });
  let musicUrl = refreshedProject?.backgroundMusicUrl;
  const musicProvider = refreshedProject?.musicProvider;

  if (musicProvider && musicProvider !== "failed" && musicProvider !== "none" && !musicUrl) {
    console.log("Waiting for background music to finish...");
    for (let i = 0; i < 9 && !musicUrl; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      const p = await db.project.findUnique({
        where: { id: projectId },
        select: { backgroundMusicUrl: true }
      });
      musicUrl = p?.backgroundMusicUrl ?? undefined;
    }
  }

  if (musicUrl) {
    try {
      const musicFilePath = path.join(dir, "bgmusic.mp3");
      musicLocalPath = await downloadToFile(musicUrl, musicFilePath);
      console.log("Background music downloaded:", musicLocalPath);
    } catch (err) {
      console.warn("Failed to download background music (will skip):", err);
      musicLocalPath = null;
    }
  }

  const outputFilename = "final.mp4";
  const outputPath = path.join(dir, outputFilename);
  const ffmpegArgs = ["-y", "-hide_banner", "-loglevel", "error"];

  for (const clip of localClips) {
    ffmpegArgs.push("-i", clip);
  }

  const voiceIdx = localClips.length;
  ffmpegArgs.push("-i", speech.localPath);

  if (musicLocalPath) {
    const musicIdx = voiceIdx + 1;
    const musicVolume = process.env.MUSIC_VOLUME || "0.12";
    ffmpegArgs.push("-i", musicLocalPath);
    ffmpegArgs.push(
      "-filter_complex",
      `${buildConcatFilter(localClips.length, project.aspectRatio)};[${voiceIdx}:a]apad[voice];[${musicIdx}:a]volume=${musicVolume},apad[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]`,
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-shortest",
      "-movflags", "+faststart",
      outputPath
    );
  } else {
    ffmpegArgs.push(
      "-filter_complex",
      buildConcatFilter(localClips.length, project.aspectRatio),
      "-map", "[vout]",
      "-map", `${voiceIdx}:a:0`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-af", "apad",
      "-shortest",
      "-movflags", "+faststart",
      outputPath
    );
  }

  await execFileAsync(getFfmpegPath(), ffmpegArgs);

  // 可选：将字幕烧录进视频
  const burnSubtitles = process.env.SUBTITLE_BURN === "true";
  if (burnSubtitles && packaging.srtLocalPath) {
    const burnedFilename = "final-subtitled.mp4";
    const burnedPath = path.join(dir, burnedFilename);
    const fontSize = process.env.SUBTITLE_FONT_SIZE || "18";
    const burnArgs = [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", outputPath,
      "-vf", `subtitles='${packaging.srtLocalPath.replace(/'/g, "\\'")}':force_style='FontSize=${fontSize},Alignment=2,MarginV=30'`,
      "-c:a", "copy",
      burnedPath
    ];
    await execFileAsync(getFfmpegPath(), burnArgs);
    // 替换 outputPath 使后续上传烧录版本
    ffmpegArgs; // no-op reference to avoid lint
    const burnedSize = await getFileSize(burnedPath).catch(() => null);
    if (burnedSize && burnedSize > 0) {
      const fs = await import("node:fs/promises");
      await fs.rename(burnedPath, outputPath);
    }
  }

  const finalLocalUrl = getProjectPublicUrl(projectId, outputFilename);
  const publishedFinal = await publishProjectFile({
    projectId,
    filename: outputFilename,
    localPath: outputPath,
    localUrl: finalLocalUrl,
    contentType: "video/mp4"
  });
  const finalUrl = publishedFinal.url;

  await db.asset.upsert({
    where: {
      id: `${projectId}-final-video`
    },
    update: {
      url: finalUrl,
      mimeType: "video/mp4",
      sizeBytes: await getFileSize(outputPath),
      metadata: {
        mode: "ffmpeg",
        clips: clipSources.length,
        audioUrl: publishedSpeech.url,
        subtitleUrl: packaging.subtitleUrl,
        coverUrl: packaging.coverUrl,
        storage: publishedFinal
      }
    },
    create: {
      id: `${projectId}-final-video`,
      projectId,
      type: "final_video",
      url: finalUrl,
      mimeType: "video/mp4",
      sizeBytes: await getFileSize(outputPath),
      metadata: {
        mode: "ffmpeg",
        clips: clipSources.length,
        audioUrl: publishedSpeech.url,
        subtitleUrl: packaging.subtitleUrl,
        coverUrl: packaging.coverUrl,
        storage: publishedFinal
      }
    }
  });

  await db.modelTask.create({
    data: {
      projectId,
      provider: "ffmpeg",
      model: "concat-audio-v1",
      taskType: "render",
      status: "completed",
      inputJson: {
        clips: clipSources.map((clip) => clip.url),
        audioUrl: publishedSpeech.url,
        subtitleUrl: packaging.subtitleUrl,
        coverUrl: packaging.coverUrl
      },
      outputJson: {
        finalVideoUrl: finalUrl
      },
      latencyMs: Date.now() - startedMs,
      startedAt,
      completedAt: new Date()
    }
  });

  const totalCostCredits = completedScenes.length * 15 + 8;

  // 扣除积分
  try {
    const { deductCredits } = await import("./credits");
    await deductCredits(
      project.userId,
      projectId,
      totalCostCredits,
      `视频生成：${completedScenes.length} 个场景 + 渲染`
    );
  } catch (err) {
    console.warn("积分扣除失败（不阻断完成）:", err);
  }

  const completed = await db.project.update({
    where: { id: projectId },
    data: {
      status: "completed",
      progress: 100,
      finalVideoUrl: finalUrl,
      thumbnailUrl: packaging.coverUrl,
      renderedAt: new Date(),
      completedAt: new Date(),
      failedAt: null,
      errorMessage: null,
      totalCostCredits
    }
  });

  // A/B 批量：AI 评分 + 更新 batch winner（非阻断）
  if ((project as any).batchId) {
    void (async () => {
      try {
        const { scoreProjectVariant } = await import("./oneai");
        const script: any = project.scriptJson || {};
        const score = await scoreProjectVariant({
          projectId,
          topic: project.topic,
          hook: script.hook || "",
          body: script.body || "",
          variantLabel: (project as any).variantLabel || undefined,
          platform: project.platform,
          language: project.language
        });

        await db.project.update({ where: { id: projectId }, data: { aiScore: score } });

        // 检查同批次是否所有项目都已完成
        const batchId = (project as any).batchId as string;
        const batchProjects = await db.project.findMany({
          where: { batchId },
          select: { id: true, status: true, aiScore: true }
        });

        const allDone = batchProjects.every((p) => p.status === "completed" || p.status === "failed");
        if (allDone) {
          const winner = batchProjects
            .filter((p) => p.aiScore !== null)
            .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))[0];
          if (winner) {
            await db.project.update({ where: { id: winner.id }, data: { isWinner: true } });
            await db.projectBatch.update({
              where: { id: batchId },
              data: { status: "completed", winnerProjectId: winner.id }
            });
            console.log(`Batch ${batchId} complete. Winner: ${winner.id} (score: ${winner.aiScore})`);
          }
        }
      } catch (err) {
        console.warn("AI scoring failed (non-fatal):", err);
      }
    })();
  }

  return completed;
}