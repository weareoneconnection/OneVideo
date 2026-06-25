import { writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { GenerateSpeechInput, GenerateSpeechResult } from "../tts-provider";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfig() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
    modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
    stability: Number(process.env.ELEVENLABS_VOICE_STABILITY || 0.5),
    similarityBoost: Number(process.env.ELEVENLABS_VOICE_SIMILARITY || 0.75),
    baseUrl: "https://api.elevenlabs.io"
  };
}

export async function uploadVoiceSample(
  audioBuffer: Buffer,
  name: string,
  filename: string
): Promise<string> {
  const { apiKey, baseUrl } = getConfig();

  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const formData = new FormData();
  formData.append("name", name);
  formData.append(
    "files",
    new Blob([audioBuffer.buffer as ArrayBuffer], { type: "audio/mpeg" }),
    filename
  );

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${baseUrl}/v1/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData
    });

    if (res.status === 429 && attempt < maxRetries) {
      await sleep(15000 * Math.pow(2, attempt));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ElevenLabs add voice failed: HTTP ${res.status} — ${text}`);
    }

    const data: any = await res.json();
    const voiceId: string = data.voice_id;
    if (!voiceId) throw new Error("ElevenLabs returned no voice_id");
    return voiceId;
  }

  throw new Error("ElevenLabs add voice: max retries exceeded");
}

export async function deleteElevenLabsVoice(voiceId: string): Promise<void> {
  const { apiKey, baseUrl } = getConfig();
  if (!apiKey) return;

  await fetch(`${baseUrl}/v1/voices/${voiceId}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey }
  });
}

export async function generateSpeechWithElevenLabs(
  input: GenerateSpeechInput & { voiceId: string }
): Promise<GenerateSpeechResult> {
  const { apiKey, baseUrl, modelId, stability, similarityBoost } = getConfig();

  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const body = {
    text: input.text,
    model_id: modelId,
    voice_settings: {
      stability,
      similarity_boost: similarityBoost
    }
  };

  const maxRetries = 3;
  let res!: Response;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    res = await fetch(`${baseUrl}/v1/text-to-speech/${input.voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg"
      },
      body: JSON.stringify(body)
    });

    if (res.status === 429 && attempt < maxRetries) {
      const waitMs = 10000 * Math.pow(2, attempt);
      console.warn(`ElevenLabs TTS 429, retrying in ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }

    break;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs TTS failed: HTTP ${res.status} — ${text}`);
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `elevenlabs-${input.projectId}-${Date.now()}.mp3`);
  await writeFile(tmpPath, audioBuffer);

  return {
    provider: "elevenlabs",
    model: modelId,
    url: tmpPath,
    localPath: tmpPath,
    mimeType: "audio/mpeg"
  };
}
