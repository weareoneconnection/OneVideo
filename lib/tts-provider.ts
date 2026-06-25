import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ensureProjectPublicDir, getProjectPublicUrl } from "./file-storage";

const execFileAsync = promisify(execFile);

export type GenerateSpeechInput = {
  projectId: string;
  text: string;
  durationSeconds: number;
  language: string;
  elevenLabsVoiceId?: string;
};

export type GenerateSpeechResult = {
  provider: string;
  model: string;
  url: string;
  localPath: string;
  mimeType: string;
  raw?: unknown;
};

function getTtsProvider() {
  const provider = process.env.TTS_PROVIDER;
  if (provider) return provider;
  return process.platform === "darwin" ? "system" : "silent";
}

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function getSystemVoice() {
  const voice = process.env.SYSTEM_TTS_VOICE?.trim();
  if (!voice || voice.toLowerCase() === "openai") return null;
  return voice;
}

async function assertFfmpegAvailable() {
  try {
    await execFileAsync(getFfmpegPath(), ["-version"]);
  } catch {
    throw new Error("FFmpeg is required for TTS audio conversion. Set FFMPEG_PATH or install ffmpeg.");
  }
}

export async function generateSpeech(
  input: GenerateSpeechInput
): Promise<GenerateSpeechResult> {
  // 若传入 voiceId，优先使用 ElevenLabs 克隆声音
  if (input.elevenLabsVoiceId) {
    const { generateSpeechWithElevenLabs } = await import("./providers/elevenlabs");
    return generateSpeechWithElevenLabs({ ...input, voiceId: input.elevenLabsVoiceId });
  }

  const provider = getTtsProvider();

  if (provider === "elevenlabs") {
    throw new Error("TTS_PROVIDER=elevenlabs requires elevenLabsVoiceId. Use a VoiceProfile or switch to openai/system.");
  }

  if (provider === "openai") {
    return generateWithOpenAI(input);
  }

  if (provider === "silent") {
    return generateSilentAudio(input);
  }

  return generateWithSystemSay(input);
}

async function generateWithSystemSay(
  input: GenerateSpeechInput
): Promise<GenerateSpeechResult> {
  if (process.platform !== "darwin") {
    return generateSilentAudio(input);
  }

  await assertFfmpegAvailable();

  const dir = await ensureProjectPublicDir(input.projectId);
  const rawPath = path.join(dir, "voiceover.aiff");
  const outputPath = path.join(dir, "voiceover.mp3");
  const args = ["-o", rawPath];
  const requestedVoice = process.env.SYSTEM_TTS_VOICE?.trim() || null;
  let voice = getSystemVoice();
  let usedDefaultVoice = !voice;

  if (voice) {
    args.push("-v", voice);
  }

  args.push(input.text);

  try {
    await execFileAsync("say", args);
  } catch (error) {
    if (!voice) throw error;
    voice = null;
    usedDefaultVoice = true;
    await execFileAsync("say", ["-o", rawPath, input.text]);
  }

  await execFileAsync(getFfmpegPath(), [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    rawPath,
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "4",
    outputPath
  ]);

  return {
    provider: "system",
    model: voice || "macos-default",
    url: getProjectPublicUrl(input.projectId, "voiceover.mp3"),
    localPath: outputPath,
    mimeType: "audio/mpeg",
    raw: {
      requestedVoice,
      usedDefaultVoice
    }
  };
}

async function generateWithOpenAI(
  input: GenerateSpeechInput
): Promise<GenerateSpeechResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.TTS_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or TTS_API_KEY is required when TTS_PROVIDER=openai.");
  }

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE || "alloy";
  const url = `${baseUrl.replace(/\/$/, "")}/v1/audio/speech`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      voice,
      input: input.text,
      response_format: "mp3"
    })
  });

  if (!res.ok) {
    throw new Error(`OpenAI TTS failed: HTTP ${res.status} ${res.statusText} ${await res.text()}`);
  }

  const dir = await ensureProjectPublicDir(input.projectId);
  const outputPath = path.join(dir, "voiceover.mp3");
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(outputPath, bytes);

  return {
    provider: "openai",
    model,
    url: getProjectPublicUrl(input.projectId, "voiceover.mp3"),
    localPath: outputPath,
    mimeType: "audio/mpeg",
    raw: {
      voice
    }
  };
}

async function generateSilentAudio(
  input: GenerateSpeechInput
): Promise<GenerateSpeechResult> {
  await assertFfmpegAvailable();

  const dir = await ensureProjectPublicDir(input.projectId);
  const outputPath = path.join(dir, "voiceover.mp3");

  await execFileAsync(getFfmpegPath(), [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(input.durationSeconds),
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "6",
    outputPath
  ]);

  return {
    provider: "silent",
    model: "ffmpeg-anullsrc",
    url: getProjectPublicUrl(input.projectId, "voiceover.mp3"),
    localPath: outputPath,
    mimeType: "audio/mpeg"
  };
}
