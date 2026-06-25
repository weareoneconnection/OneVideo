import { readFile } from "node:fs/promises";
import path from "node:path";

export type WordTimestamp = {
  word: string;
  start: number; // seconds
  end: number;
};

export type WhisperResult = {
  text: string;
  words: WordTimestamp[];
  language: string;
};

export async function transcribeAudio(audioPath: string, language?: string): Promise<WhisperResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");

  if (!apiKey) throw new Error("OPENAI_API_KEY not set — cannot use Whisper");

  const audioBuffer = await readFile(audioPath);
  const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });

  const form = new FormData();
  form.append("file", audioBlob, path.basename(audioPath));
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (language) form.append("language", language === "zh" ? "zh" : "en");

  const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const words: WordTimestamp[] = (data.words || []).map((w: any) => ({
    word: w.word,
    start: w.start,
    end: w.end
  }));

  return { text: data.text || "", words, language: data.language || language || "zh" };
}

// Fallback: 用 voiceover 文本 + 总时长均匀估算单词时间戳
export function estimateWordTimestamps(text: string, totalSeconds: number): WordTimestamp[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const perWord = totalSeconds / words.length;
  return words.map((word, i) => ({
    word,
    start: parseFloat((i * perWord).toFixed(3)),
    end: parseFloat(((i + 1) * perWord).toFixed(3))
  }));
}
