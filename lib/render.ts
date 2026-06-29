import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { copyFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { db } from "./db";
import { ensureProjectPublicDir, getProjectPublicUrl } from "./file-storage";
import { createPackagingAssets } from "./packaging";
import { publishProjectFile } from "./storage-provider";
import { generateSpeech } from "./tts-provider";
import { transcribeAudio, estimateWordTimestamps } from "./whisper";
import { buildSubtitleFile, getSubtitleBurnFilter, type SubtitleStyle } from "./subtitle-renderer";
import { generateSceneSfx, mixSfxUnderVoiceover } from "./providers/sfx";

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

// 根据场景 mood 和对话密度计算节奏转场时长
// 高密度对话（≥3行）→ 快切 0.15s；高潮/动作 mood → 0.2s；正常 → 0.4s
function getRhythmTransitionDuration(
  sceneIdx: number,
  moods: string[],
  dialogueCounts: number[]
): number {
  const base = Number(process.env.VIDEO_TRANSITION_DURATION_S || 0.4);
  const mood = (moods[sceneIdx] || "").toLowerCase();
  const dialogueCount = dialogueCounts[sceneIdx] || 0;
  if (dialogueCount >= 3) return Math.min(base, 0.15);
  if (/action|conflict|climax|高潮|冲突|激烈/.test(mood)) return Math.min(base, 0.2);
  if (/calm|slow|tender|温柔|平静|感动/.test(mood)) return Math.max(base, 0.6);
  return base;
}

function buildConcatFilter(clipCount: number, aspectRatio: string, clipDurations?: number[], sceneMeta?: { moods: string[]; dialogueCounts: number[] }) {
  const { width, height } = getRenderSize(aspectRatio);
  const normalizedClips = Array.from({ length: clipCount }, (_, index) => {
    return `[${index}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${index}]`;
  });

  const transitionStyle = process.env.VIDEO_TRANSITION || "fade";
  const transitionDuration = Number(process.env.VIDEO_TRANSITION_DURATION_S || 0.4);
  const useTransitions =
    transitionStyle !== "none" &&
    transitionDuration > 0 &&
    clipCount > 1 &&
    clipDurations &&
    clipDurations.length === clipCount;

  if (!useTransitions) {
    const concatInputs = Array.from({ length: clipCount }, (_, i) => `[v${i}]`).join("");
    return `${normalizedClips.join(";")};${concatInputs}concat=n=${clipCount}:v=1:a=0[vout]`;
  }

  // Chain xfade transitions with rhythm-aware durations
  let filter = normalizedClips.join(";");
  let prevLabel = "v0";
  let timeOffset = 0;

  for (let i = 1; i < clipCount; i++) {
    const tDur = sceneMeta
      ? getRhythmTransitionDuration(i - 1, sceneMeta.moods, sceneMeta.dialogueCounts)
      : transitionDuration;
    const offset = timeOffset + clipDurations[i - 1] - tDur;
    const outLabel = i === clipCount - 1 ? "vout" : `xf${i}`;
    filter += `;[${prevLabel}][v${i}]xfade=transition=${transitionStyle}:duration=${tDur}:offset=${Math.max(0, offset).toFixed(3)}[${outLabel}]`;
    prevLabel = outLabel;
    timeOffset += clipDurations[i - 1] - tDur;
  }

  return filter;
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
    (scene: RenderSceneItem) =>
      scene.status === "completed" &&
      scene.videoUrl &&
      // SVG placeholders are not real video clips — block them from entering render
      !scene.videoUrl.endsWith(".svg") &&
      !scene.videoUrl.includes("image/svg") &&
      !scene.videoUrl.includes("director-reference") &&
      !scene.videoUrl.includes("first-frame") &&
      !scene.videoUrl.includes("placeholder")
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
  const videoProvider = process.env.VIDEO_PROVIDER || "mock";
  // Seedance/Kling generate videos with their own audio — strip it so TTS voiceover is clear
  const stripClipAudio = process.env.STRIP_CLIP_AUDIO !== "false" &&
    (videoProvider === "seedance" || videoProvider === "kling" || videoProvider === "runway");

  for (const clip of clipSources) {
    const rawPath = path.join(dir, clip.filename);
    await downloadToFile(clip.url, rawPath);

    if (stripClipAudio) {
      // Re-encode to strip audio track from generated video clips
      const silentPath = rawPath.replace(/\.mp4$/, "-silent.mp4");
      await execFileAsync(getFfmpegPath(), [
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", rawPath, "-an", "-c:v", "copy", silentPath
      ]);
      localClips.push(silentPath);
    } else {
      localClips.push(rawPath);
    }
  }

  // Clip durations for xfade transitions (scene-level if available, else uniform)
  const clipDurations: number[] = hasSceneTimeline
    ? completedScenes.map((s: RenderSceneItem) => s.durationSeconds || 5)
    : [project.durationSeconds];

  // Scene metadata for rhythm-aware transitions
  const sceneMeta = hasSceneTimeline ? {
    moods: completedScenes.map((s: RenderSceneItem) => (s as any).mood || ""),
    dialogueCounts: completedScenes.map((s: RenderSceneItem) => {
      const d = (s as any).dialogues;
      return Array.isArray(d) ? d.length : 0;
    })
  } : undefined;

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

  // AI SFX: generate mood-based sound effects and mix under voiceover
  let sfxLocalPath: string | null = null;
  if (process.env.SFX_ENABLED === "true" && hasSceneTimeline && completedScenes.length > 0) {
    try {
      const dominantMood = (completedScenes[0] as any).mood || "default";
      const totalDuration = clipDurations.reduce((a: number, b: number) => a + b, 0);
      const sfxPath = path.join(dir, "sfx.mp3");
      await generateSceneSfx({ mood: dominantMood, durationSeconds: totalDuration, outputPath: sfxPath });
      sfxLocalPath = sfxPath;
    } catch (err) {
      console.warn("[render] SFX generation failed, skipping:", err);
    }
  }

  // Mix SFX under voiceover if available
  let effectiveSpeechPath = speech.localPath;
  if (sfxLocalPath) {
    try {
      const mixedPath = path.join(dir, "voiceover-with-sfx.mp3");
      await mixSfxUnderVoiceover({
        voiceoverPath: speech.localPath,
        sfxPath: sfxLocalPath,
        outputPath: mixedPath
      });
      effectiveSpeechPath = mixedPath;
    } catch (err) {
      console.warn("[render] SFX mixing failed, using plain voiceover:", err);
    }
  }

  const outputFilename = "final.mp4";
  const outputPath = path.join(dir, outputFilename);
  const ffmpegArgs = ["-y", "-hide_banner", "-loglevel", "error"];

  for (const clip of localClips) {
    ffmpegArgs.push("-i", clip);
  }

  const voiceIdx = localClips.length;
  ffmpegArgs.push("-i", effectiveSpeechPath);

  if (musicLocalPath) {
    const musicIdx = voiceIdx + 1;
    const musicVolume = process.env.MUSIC_VOLUME || "0.12";
    ffmpegArgs.push("-i", musicLocalPath);
    ffmpegArgs.push(
      "-filter_complex",
      `${buildConcatFilter(localClips.length, project.aspectRatio, clipDurations, sceneMeta)};[${voiceIdx}:a]apad[voice];[${musicIdx}:a]volume=${musicVolume},apad[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]`,
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
      buildConcatFilter(localClips.length, project.aspectRatio, clipDurations, sceneMeta),
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

  // 智能字幕：Whisper 转录 + 爆款样式烧录
  const subtitleStyle = ((project as any).subtitleStyle || "tiktok") as SubtitleStyle;
  const subtitleEnabled = (project as any).subtitleEnabled !== false;
  const burnSubtitlesLegacy = process.env.SUBTITLE_BURN === "true";

  if (subtitleEnabled && subtitleStyle !== "none") {
    try {
      console.log(`[subtitle] Transcribing with Whisper (style: ${subtitleStyle})...`);

      // 尝试 Whisper 精准转录，失败则 fallback 到均匀估算
      let wordTimestamps;
      try {
        const result = await transcribeAudio(speech.localPath, project.language);
        wordTimestamps = result.words.length > 0 ? result.words : estimateWordTimestamps(voiceoverText, project.durationSeconds);
        console.log(`[subtitle] Whisper got ${result.words.length} words`);
      } catch (whisperErr) {
        console.warn("[subtitle] Whisper failed, using estimated timestamps:", whisperErr);
        wordTimestamps = estimateWordTimestamps(voiceoverText, project.durationSeconds);
      }

      // 生成字幕文件 (ASS 或 SRT)
      const { content: subtitleContent, ext } = buildSubtitleFile(wordTimestamps, subtitleStyle);
      const subtitleFilename = `subtitles-smart.${ext}`;
      const subtitleLocalPath = path.join(dir, subtitleFilename);
      await writeFile(subtitleLocalPath, subtitleContent, "utf8");

      // 上传字幕文件
      const publishedSub = await publishProjectFile({
        projectId,
        filename: subtitleFilename,
        localPath: subtitleLocalPath,
        localUrl: getProjectPublicUrl(projectId, subtitleFilename),
        contentType: ext === "ass" ? "text/plain" : "text/plain"
      });
      await db.project.update({ where: { id: projectId }, data: { whisperSrtUrl: publishedSub.url } });

      // 烧录字幕
      const burnedFilename = "final-subtitled.mp4";
      const burnedPath = path.join(dir, burnedFilename);
      const vfFilter = getSubtitleBurnFilter(subtitleLocalPath, subtitleStyle);
      const burnArgs = [
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", outputPath,
        "-vf", vfFilter,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-c:a", "copy",
        burnedPath
      ];
      await execFileAsync(getFfmpegPath(), burnArgs);
      const burnedSize = await getFileSize(burnedPath).catch(() => null);
      if (burnedSize && burnedSize > 0) {
        await rename(burnedPath, outputPath);
        console.log(`[subtitle] Burned subtitles (style: ${subtitleStyle}) into final video`);
      }
    } catch (subtitleErr) {
      console.warn("[subtitle] Subtitle burn failed (non-fatal, using video without subtitles):", subtitleErr);
    }
  } else if (burnSubtitlesLegacy && packaging.srtLocalPath) {
    // Legacy fallback: SUBTITLE_BURN=true 旧行为
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
    const burnedSize = await getFileSize(burnedPath).catch(() => null);
    if (burnedSize && burnedSize > 0) {
      const fsp = await import("node:fs/promises");
      await fsp.rename(burnedPath, outputPath);
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