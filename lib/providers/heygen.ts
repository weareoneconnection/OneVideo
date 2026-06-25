import type { CreateVideoTaskResult, GenerateVideoInput, PollVideoTaskResult } from "../video-provider";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfig() {
  return {
    apiKey: process.env.HEYGEN_API_KEY || "",
    baseUrl: (process.env.HEYGEN_BASE_URL || "https://api.heygen.com").replace(/\/$/, ""),
    maxRetries: Number(process.env.HEYGEN_RATE_LIMIT_RETRIES || 3),
    pollIntervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 10000),
    pollAttempts: Number(process.env.HEYGEN_POLL_ATTEMPTS || 30),
    defaultVoiceId: process.env.HEYGEN_DEFAULT_VOICE_ID || ""
  };
}

function normalizeHeyGenRatio(aspectRatio: string): "16:9" | "9:16" | "1:1" {
  if (aspectRatio === "16:9") return "16:9";
  if (aspectRatio === "1:1") return "1:1";
  return "9:16";
}

export async function createHeyGenVideoTask(
  input: GenerateVideoInput & { avatarId: string; voiceover?: string }
): Promise<CreateVideoTaskResult> {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    throw new Error("HEYGEN_API_KEY is not set");
  }

  const script = input.voiceover || input.prompt;
  const ratio = normalizeHeyGenRatio(input.aspectRatio);

  const body = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: input.avatarId,
          avatar_style: "normal"
        },
        voice: cfg.defaultVoiceId
          ? { type: "text", input_text: script, voice_id: cfg.defaultVoiceId }
          : { type: "text", input_text: script },
        background: { type: "color", value: "#000000" }
      }
    ],
    aspect_ratio: ratio,
    test: process.env.NODE_ENV !== "production"
  };

  let res!: Response;
  let text!: string;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    res = await fetch(`${cfg.baseUrl}/v2/video/generate`, {
      method: "POST",
      headers: {
        "X-Api-Key": cfg.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    text = await res.text();

    if (res.status !== 429) break;
    if (attempt < cfg.maxRetries) {
      const waitMs = 15000 * Math.pow(2, attempt);
      console.warn(`HeyGen 429, retrying in ${waitMs}ms (attempt ${attempt + 1}/${cfg.maxRetries})`);
      await sleep(waitMs);
    }
  }

  if (!res.ok) {
    throw new Error(`HeyGen create failed: HTTP ${res.status} — ${text}`);
  }

  const data: any = JSON.parse(text);
  const videoId: string = data.data?.video_id || data.video_id;
  if (!videoId) {
    throw new Error(`HeyGen returned no video_id: ${text}`);
  }

  console.log("HeyGen video task created:", { videoId, avatarId: input.avatarId });

  return {
    provider: "heygen",
    model: "heygen-avatar-v2",
    externalTaskId: videoId,
    generationType: "text_to_video",
    raw: data
  };
}

export async function pollHeyGenVideoTask(
  input: Pick<PollVideoTaskResult, "provider" | "model" | "externalTaskId" | "generationType">
): Promise<PollVideoTaskResult> {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    return { ...input, status: "failed", errorMessage: "HEYGEN_API_KEY is not set" };
  }

  const res = await fetch(
    `${cfg.baseUrl}/v1/video_status.get?video_id=${input.externalTaskId}`,
    { headers: { "X-Api-Key": cfg.apiKey } }
  );

  const text = await res.text();
  if (!res.ok) {
    return { ...input, status: "failed", rawStatus: String(res.status), errorMessage: `HeyGen poll failed: HTTP ${res.status}` };
  }

  const data: any = JSON.parse(text);
  const status: string = (data.data?.status || data.status || "").toLowerCase();
  const videoUrl: string | undefined = data.data?.video_url || data.video_url;

  console.log("HeyGen poll:", { videoId: input.externalTaskId, status, hasUrl: !!videoUrl });

  if (status === "completed" && videoUrl) {
    return { ...input, status: "completed", rawStatus: status, videoUrl, raw: data };
  }
  if (["failed", "error"].includes(status)) {
    return { ...input, status: "failed", rawStatus: status, errorMessage: `HeyGen task failed: ${status}`, raw: data };
  }
  return { ...input, status: "pending", rawStatus: status, raw: data };
}
