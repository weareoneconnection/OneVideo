/**
 * AI SFX — mood 驱动环境音效叠加
 *
 * 策略:
 *  1. ElevenLabs Sound Generation (ELEVENLABS_API_KEY 存在时)
 *  2. 本地静音 fallback (ffmpeg anullsrc)
 *
 * 环境变量:
 *   ELEVENLABS_API_KEY — ElevenLabs API Key
 *   SFX_DURATION_SECONDS — 默认音效时长，默认跟场景时长
 *   SFX_VOLUME — 音效混音音量 (0.0~1.0)，默认 0.15
 */

import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

// mood → SFX 描述提示词（中英双语 → English for ElevenLabs）
const MOOD_TO_SFX: Record<string, string> = {
  // 情感类
  "温柔": "soft ambient piano melody with gentle wind",
  "感动": "emotional strings music with soft heartbeat",
  "浪漫": "romantic violin music with soft rain",
  "sad": "melancholic piano music, gentle rain drops",
  "tender": "soft acoustic guitar, warm ambiance",
  "romantic": "soft violin melody, light breeze",

  // 紧张/冲突
  "紧张": "tense cinematic strings, heartbeat",
  "冲突": "dramatic impact sound, tension build",
  "愤怒": "heavy bass rumble, intense atmosphere",
  "conflict": "dramatic cinematic tension music",
  "action": "fast-paced action music, impact sounds",
  "climax": "epic orchestral crescendo, intense drums",

  // 平静
  "平静": "gentle nature ambiance, birds chirping, soft breeze",
  "calm": "peaceful nature sounds, light wind, distant birds",
  "思考": "soft lo-fi ambient music, coffee shop background",

  // 希望/励志
  "希望": "uplifting melodic piano with light percussion",
  "坚定": "determined marching rhythm, bold strings",
  "励志": "motivational cinematic music, rising melody",
  "momentum": "driving cinematic music, building energy",
  "hopeful": "bright piano melody, gentle orchestral swells",

  // 悬疑
  "悬疑": "mysterious ambient music, subtle tension",
  "mystery": "eerie ambient sounds, subtle tension drone",

  // 默认
  "default": "subtle cinematic ambient atmosphere"
};

function getMoodSfxPrompt(mood: string): string {
  if (!mood) return MOOD_TO_SFX["default"];
  const lower = mood.toLowerCase();
  // 精确匹配
  if (MOOD_TO_SFX[mood]) return MOOD_TO_SFX[mood];
  if (MOOD_TO_SFX[lower]) return MOOD_TO_SFX[lower];
  // 模糊匹配
  for (const [key, val] of Object.entries(MOOD_TO_SFX)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  return MOOD_TO_SFX["default"];
}

async function generateElevenLabsSfx(prompt: string, durationSeconds: number, outputPath: string): Promise<boolean> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === "your_key") return false;

  const clampedDuration = Math.min(Math.max(durationSeconds, 0.5), 22); // ElevenLabs max 22s

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: clampedDuration,
        prompt_influence: 0.3
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[sfx] ElevenLabs SFX failed (${res.status}): ${err.slice(0, 100)}`);
      return false;
    }

    const buf = await res.arrayBuffer();
    await writeFile(outputPath, Buffer.from(buf));
    return true;
  } catch (err) {
    console.warn("[sfx] ElevenLabs SFX error:", err);
    return false;
  }
}

async function generateSilentSfx(durationSeconds: number, outputPath: string): Promise<void> {
  await execFileAsync(getFfmpegPath(), [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t", String(Math.max(0.5, durationSeconds)),
    "-codec:a", "libmp3lame", "-q:a", "6",
    outputPath
  ]);
}

export async function generateSceneSfx(input: {
  mood: string;
  durationSeconds: number;
  outputPath: string;
}): Promise<{ path: string; prompt: string }> {
  const prompt = getMoodSfxPrompt(input.mood);
  console.log(`[sfx] Generating SFX for mood="${input.mood}": "${prompt}"`);

  const ok = await generateElevenLabsSfx(prompt, input.durationSeconds, input.outputPath);
  if (!ok) {
    await generateSilentSfx(input.durationSeconds, input.outputPath);
    console.log(`[sfx] Fallback: silent audio at ${input.outputPath}`);
  } else {
    console.log(`[sfx] Generated SFX at ${input.outputPath}`);
  }

  return { path: input.outputPath, prompt };
}

/**
 * Mix SFX under a primary audio track using ffmpeg amix.
 * Returns path to the mixed audio file.
 */
export async function mixSfxUnderVoiceover(input: {
  voiceoverPath: string;
  sfxPath: string;
  outputPath: string;
  sfxVolume?: number;
}): Promise<string> {
  const vol = input.sfxVolume ?? Number(process.env.SFX_VOLUME || 0.15);

  await execFileAsync(getFfmpegPath(), [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", input.voiceoverPath,
    "-i", input.sfxPath,
    "-filter_complex",
    `[1:a]volume=${vol}[sfx];[0:a][sfx]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    "-map", "[aout]",
    "-codec:a", "libmp3lame", "-q:a", "3",
    input.outputPath
  ]);

  return input.outputPath;
}
