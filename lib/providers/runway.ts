import type {
  GenerateVideoInput,
  CreateVideoTaskResult,
  PollVideoTaskInput,
  PollVideoTaskResult,
  VideoGenerationType
} from "../video-provider";
import { VideoProviderError } from "../video-provider";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRunwayConfig() {
  return {
    apiKey: process.env.RUNWAY_API_KEY || "",
    baseUrl: (process.env.RUNWAY_BASE_URL || "https://api.dev.runwayml.com").replace(/\/$/, ""),
    model: process.env.RUNWAY_MODEL || "gen4_turbo"
  };
}

export async function createRunwayVideoTask(
  input: GenerateVideoInput
): Promise<CreateVideoTaskResult> {
  const { apiKey, baseUrl, model } = getRunwayConfig();

  if (!apiKey) {
    throw new VideoProviderError("Runway skipped: missing RUNWAY_API_KEY", {
      provider: "runway",
      model
    });
  }

  const generationType: VideoGenerationType =
    input.firstFrameUrl || input.referenceImageUrl ? "image_to_video" : "text_to_video";

  const body: Record<string, unknown> = {
    model,
    promptText: input.prompt,
    ratio: normalizeRunwayRatio(input.aspectRatio),
    duration: Math.min(Math.max(input.durationSeconds, 5), 10)
  };

  if (generationType === "image_to_video") {
    body.promptImage = [{ uri: input.firstFrameUrl || input.referenceImageUrl, position: "first" }];
  }

  const maxRetries = Number(process.env.RUNWAY_RATE_LIMIT_RETRIES || 3);
  const baseDelayMs = Number(process.env.RUNWAY_RATE_LIMIT_DELAY_MS || 15000);

  let res!: Response;
  let text!: string;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    res = await fetch(`${baseUrl}/v1/image_to_video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06"
      },
      body: JSON.stringify(body)
    });

    text = await res.text();

    if (res.status !== 429) break;

    if (attempt < maxRetries) {
      const waitMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(`Runway 429 rate limit, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
    }
  }

  if (!res.ok) {
    throw new VideoProviderError(
      `Runway create task failed: HTTP ${res.status} ${res.statusText}`,
      { provider: "runway", model, raw: { body: text } }
    );
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new VideoProviderError("Runway create response is not JSON", {
      provider: "runway",
      model,
      raw: { body: text }
    });
  }

  const taskId = data.id || data.taskId;
  if (!taskId) {
    throw new VideoProviderError("Runway create returned no task id", {
      provider: "runway",
      model,
      raw: data
    });
  }

  return {
    provider: "runway",
    model,
    externalTaskId: String(taskId),
    generationType,
    raw: data
  };
}

export async function pollRunwayVideoTask(
  input: PollVideoTaskInput
): Promise<PollVideoTaskResult> {
  const { apiKey, baseUrl } = getRunwayConfig();

  if (!apiKey) {
    return {
      ...input,
      status: "failed",
      errorMessage: "Runway skipped: missing RUNWAY_API_KEY"
    };
  }

  let res: Response;
  let text: string;

  try {
    res = await fetch(`${baseUrl}/v1/tasks/${input.externalTaskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06"
      }
    });
    text = await res.text();
  } catch (err) {
    return {
      ...input,
      status: "failed",
      errorMessage: `Runway poll network error: ${String(err)}`
    };
  }

  if (!res.ok) {
    return {
      ...input,
      status: "failed",
      rawStatus: String(res.status),
      errorMessage: `Runway poll failed: HTTP ${res.status} ${res.statusText}`
    };
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ...input,
      status: "failed",
      errorMessage: "Runway poll response is not JSON"
    };
  }

  const status: string = (data.status || "").toLowerCase();

  if (status === "succeeded" || status === "completed") {
    const videoUrl = data.output?.[0] || data.artifacts?.[0]?.url || data.videoUrl;
    if (!videoUrl) {
      return {
        ...input,
        status: "failed",
        rawStatus: status,
        errorMessage: "Runway task succeeded but no video URL in response",
        raw: data
      };
    }
    return {
      ...input,
      status: "completed",
      rawStatus: status,
      videoUrl,
      raw: data
    };
  }

  if (["failed", "canceled", "cancelled"].includes(status)) {
    return {
      ...input,
      status: "failed",
      rawStatus: status,
      errorMessage: `Runway task failed with status: ${status}`,
      raw: data
    };
  }

  return {
    ...input,
    status: "pending",
    rawStatus: status,
    raw: data
  };
}

function normalizeRunwayRatio(aspectRatio: string): string {
  const map: Record<string, string> = {
    "9:16": "720:1280",
    "16:9": "1280:720",
    "1:1": "960:960"
  };
  return map[aspectRatio] || "720:1280";
}
