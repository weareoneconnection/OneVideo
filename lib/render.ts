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
import { generateSpeech, generateDialogueAudio } from "./tts-provider";
import type { DialogueLine } from "./types";
import { transcribeAudio, estimateWordTimestamps } from "./whisper";
import { buildSubtitleFile, buildDialogueSubtitleFromScenes, getSubtitleBurnFilter, type SubtitleStyle } from "./subtitle-renderer";
import { generateSceneSfx, mixSfxUnderVoiceover } from "./providers/sfx";

const execFileAsync = promisify(execFile);

type RenderSceneItem = {
  id: string;
  sceneIndex: number;
  durationSeconds: number;
  voiceover: string | null;
  storyBeat: string | null;
  mood: string | null;
  dialogues: unknown | null;   // DialogueLine[] stored as JSON
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

function getFfprobePath() {
  return process.env.FFPROBE_PATH || "ffprobe";
}

// Detect blank/white/black clips via mean luma. Returns true if clip is usable.
async function isClipUsable(clipPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(getFfprobePath(), [
      "-v", "quiet",
      "-select_streams", "v:0",
      "-show_entries", "frame_tags=lavfi.signalstats.YAVG",
      "-f", "lavfi",
      "-i", `movie=${clipPath.replace(/\\/g, "/")},signalstats`,
      "-of", "json"
    ], { timeout: 15000 });
    const parsed = JSON.parse(stdout) as { frames?: { tags?: { "lavfi.signalstats.YAVG"?: string } }[] };
    const frames = parsed.frames ?? [];
    if (frames.length === 0) return true;
    // Sample up to 5 frames evenly
    const sample = [0, Math.floor(frames.length / 4), Math.floor(frames.length / 2), Math.floor(3 * frames.length / 4), frames.length - 1]
      .filter((i, pos, arr) => arr.indexOf(i) === pos)
      .map(i => parseFloat(frames[i]?.tags?.["lavfi.signalstats.YAVG"] ?? "128"));
    const avgLuma = sample.reduce((a, b) => a + b, 0) / sample.length;
    const minLumaThreshold = Number(process.env.CLIP_MIN_LUMA ?? "8");
    const maxLumaThreshold = Number(process.env.CLIP_MAX_LUMA ?? "245");
    return avgLuma >= minLumaThreshold && avgLuma <= maxLumaThreshold;
  } catch {
    // If ffprobe fails, assume clip is usable
    return true;
  }
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
  // Clips are pre-normalized individually before this call — just label them
  const normalizedClips = Array.from({ length: clipCount }, (_, index) => {
    return `[${index}:v:0]copy[v${index}]`;
  });

  const transitionStyle = process.env.VIDEO_TRANSITION || "none"; // default off: xfade OOMs on low-memory hosts
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

  // 短剧模式：多角色对话配音；否则用单声道旁白
  const dramaMode = process.env.DRAMA_MODE === "true" && hasSceneTimeline;
  const allSceneDialogues: DialogueLine[][] = dramaMode
    ? completedScenes.map(s => (Array.isArray(s.dialogues) ? (s.dialogues as DialogueLine[]) : []))
    : [];
  const hasDramaDialogues = dramaMode && allSceneDialogues.some(d => d.length > 0);

  let speech: Awaited<ReturnType<typeof generateSpeech>>;

  if (hasDramaDialogues) {
    // 按场景依次生成多角色 TTS，合并成一段完整旁白音频
    const perSceneResults = await Promise.all(
      completedScenes.map(async (scene, i) => {
        const lines = allSceneDialogues[i];
        if (!lines.length) {
          // 无对话的场景降级为普通 TTS
          return generateSpeech({
            projectId,
            text: scene.voiceover || project.topic,
            durationSeconds: scene.durationSeconds,
            language: project.language
          });
        }
        return generateDialogueAudio({
          projectId,
          sceneIndex: scene.sceneIndex,
          dialogues: lines,
          language: project.language,
          totalDurationSeconds: scene.durationSeconds
        });
      })
    );

    if (perSceneResults.length === 1) {
      speech = perSceneResults[0];
    } else {
      // ffmpeg concat all scene audios into one voiceover track
      const { execFile: execFileNode } = await import("node:child_process");
      const { promisify: prom } = await import("node:util");
      const execFA = prom(execFileNode);
      const concatPath = path.join(dir, "voiceover.mp3");
      const inputs = perSceneResults.flatMap(r => ["-i", r.localPath]);
      await execFA(getFfmpegPath(), [
        "-y", "-hide_banner", "-loglevel", "error",
        ...inputs,
        "-filter_complex", `concat=n=${perSceneResults.length}:v=0:a=1[aout]`,
        "-map", "[aout]", "-codec:a", "libmp3lame", "-q:a", "3",
        concatPath
      ]);
      speech = { ...perSceneResults[0], localPath: concatPath, url: concatPath };
    }
  } else {
    speech = await generateSpeech({
      projectId,
      text: voiceoverText,
      durationSeconds: project.durationSeconds,
      language: project.language,
      elevenLabsVoiceId: (project as any).voiceProfile?.elevenLabsVoiceId
    });
  }
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
  const skippedClipIndices: number[] = [];
  const videoProvider = process.env.VIDEO_PROVIDER || "mock";
  // Seedance/Kling generate videos with their own audio — strip it so TTS voiceover is clear
  const stripClipAudio = process.env.STRIP_CLIP_AUDIO !== "false" &&
    (videoProvider === "seedance" || videoProvider === "kling" || videoProvider === "runway");
  const blankDetectionEnabled = process.env.CLIP_BLANK_DETECTION !== "false";

  for (let clipIdx = 0; clipIdx < clipSources.length; clipIdx++) {
    const clip = clipSources[clipIdx];
    const rawPath = path.join(dir, clip.filename);
    await downloadToFile(clip.url, rawPath);

    if (blankDetectionEnabled) {
      const usable = await isClipUsable(rawPath);
      if (!usable) {
        console.warn(`[render] Skipping blank/white clip ${clip.filename} (luma out of range)`);
        skippedClipIndices.push(clipIdx);
        continue;
      }
    }

    // Normalize each clip to target resolution individually (one ffmpeg call at a time)
    // This keeps peak memory at 1× instead of N× when done inside a single filter_complex
    const { width, height } = getRenderSize(project.aspectRatio);
    const normalizedPath = rawPath.replace(/\.mp4$/, "-norm.mp4");
    const normArgs = [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", rawPath,
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      ...(stripClipAudio ? ["-an"] : ["-c:a", "copy"]),
      normalizedPath
    ];
    await execFileAsync(getFfmpegPath(), normArgs, { timeout: 120_000 });
    localClips.push(normalizedPath);
  }

  // Remove skipped clips from duration/mood arrays
  const filteredCompletedScenes = hasSceneTimeline
    ? completedScenes.filter((_, i) => !skippedClipIndices.includes(i))
    : completedScenes;

  // Clip durations for xfade transitions (scene-level if available, else uniform)
  const clipDurations: number[] = hasSceneTimeline
    ? filteredCompletedScenes.map((s: RenderSceneItem) => s.durationSeconds || 5)
    : [project.durationSeconds];

  // Scene metadata for rhythm-aware transitions
  const sceneMeta = hasSceneTimeline ? {
    moods: filteredCompletedScenes.map((s: RenderSceneItem) => s.mood || ""),
    dialogueCounts: filteredCompletedScenes.map((s: RenderSceneItem) => {
      const d = s.dialogues;
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
    // 最多等 30s (3×10s)，避免长时间阻塞 render
    const musicWaitLimit = Number(process.env.MUSIC_WAIT_LIMIT ?? 3);
    for (let i = 0; i < musicWaitLimit && !musicUrl; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      const p = await db.project.findUnique({
        where: { id: projectId },
        select: { backgroundMusicUrl: true }
      });
      musicUrl = p?.backgroundMusicUrl ?? undefined;
    }
    if (!musicUrl) console.warn("[render] BGM not ready after wait, skipping music");
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
      // Verify the mixed file actually exists before using it
      const mixedSize = (await getFileSize(mixedPath).catch(() => 0)) ?? 0;
      if (mixedSize > 0) {
        effectiveSpeechPath = mixedPath;
      } else {
        console.warn("[render] SFX mixed file is empty, using plain voiceover");
      }
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

  // CRF (VBR) 模式：内存占用远低于 CBR (-b:v)，适合 Railway 低内存容器
  // 画质：crf 23 ≈ 1.5-2Mbps，与之前 2500k CBR 画质接近但内存减少 60%
  const videoCrf = process.env.VIDEO_CRF || "23";
  const audioBitrate = process.env.AUDIO_BITRATE || "128k";

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
      "-crf", videoCrf,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", audioBitrate,
      "-ac", "2",
      "-shortest",
      "-movflags", "+faststart",
      outputPath
    );
  } else {
    ffmpegArgs.push(
      "-filter_complex",
      `${buildConcatFilter(localClips.length, project.aspectRatio, clipDurations, sceneMeta)};[${voiceIdx}:a]apad[aout]`,
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", videoCrf,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", audioBitrate,
      "-ac", "2",
      "-shortest",
      "-movflags", "+faststart",
      outputPath
    );
  }

  // 主编码超时：每秒视频约 10s 编码时间，最少 120s，最多 300s
  const renderTimeoutMs = Math.max(120_000, (project.durationSeconds || 60) * 10_000);
  try {
    await execFileAsync(getFfmpegPath(), ffmpegArgs, { timeout: renderTimeoutMs });
  } catch (ffmpegErr: unknown) {
    // Extract the last meaningful line from ffmpeg stderr for a readable error
    const raw = (ffmpegErr as { stderr?: string; message?: string }).stderr
      || (ffmpegErr as { message?: string }).message
      || String(ffmpegErr);
    const lastLine = raw.split("\n").map(l => l.trim()).filter(Boolean).slice(-3).join(" | ");
    throw new Error(`ffmpeg encode failed: ${lastLine}`);
  }

  // 智能字幕：Whisper 转录 + 爆款样式烧录
  const subtitleStyle = ((project as any).subtitleStyle || "tiktok") as SubtitleStyle;
  const subtitleEnabled = (project as any).subtitleEnabled !== false;
  const burnSubtitlesLegacy = process.env.SUBTITLE_BURN === "true";

  if (subtitleEnabled && subtitleStyle !== "none") {
    try {
      let subtitleContent: string;
      let ext: "ass" | "srt";

      // 短剧对话字幕：用 DialogueLine 时间轴直接渲染，无需 Whisper
      if ((subtitleStyle === "dialogue" || hasDramaDialogues) && allSceneDialogues.some(d => d.length > 0)) {
        console.log("[subtitle] Drama mode: building dialogue subtitles from scene dialogue data...");
        const sceneDurs = completedScenes.map(s => s.durationSeconds);
        subtitleContent = buildDialogueSubtitleFromScenes(allSceneDialogues, sceneDurs);
        ext = "ass";
      } else {
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

        ({ content: subtitleContent, ext } = buildSubtitleFile(wordTimestamps, subtitleStyle));
      }
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
      await execFileAsync(getFfmpegPath(), burnArgs, { timeout: renderTimeoutMs });
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