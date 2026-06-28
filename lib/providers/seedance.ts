/**
 * Seedance 2.0 via Volcano Engine (火山引擎) Ark platform
 *
 * 申请地址: https://console.volcengine.com/ark
 * 文档: https://www.volcengine.com/docs/82379/1399008
 *
 * 所需环境变量:
 *   SEEDANCE_API_KEY    — 火山引擎 Ark API Key (以 "ark-" 开头)
 *   SEEDANCE_MODEL      — 模型端点ID (e.g. "ep-xxxxxxxx-xxxxx" or "seedance-1-0-lite")
 *   SEEDANCE_BASE_URL   — 可选，默认 https://ark.cn-beijing.volces.com/api/v3
 *   SEEDANCE_DURATION   — 视频时长秒数，默认 5
 *   SEEDANCE_RESOLUTION — 分辨率，默认 "1080x1920" (9:16竖屏)
 */

import type {
  GenerateVideoInput,
  CreateVideoTaskResult,
  PollVideoTaskInput,
  PollVideoTaskResult
} from "../video-provider";
import { VideoProviderError } from "../video-provider";

function getConfig() {
  return {
    apiKey: process.env.SEEDANCE_API_KEY || "",
    model: process.env.SEEDANCE_MODEL || "seedance-1-0-lite-t2v",
    baseUrl: (process.env.SEEDANCE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, ""),
    duration: Number(process.env.SEEDANCE_DURATION || 5),
    resolution: process.env.SEEDANCE_RESOLUTION || "1080x1920"
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createSeedanceVideoTask(
  input: GenerateVideoInput
): Promise<CreateVideoTaskResult> {
  const { apiKey, model, baseUrl, duration, resolution } = getConfig();

  if (!apiKey) {
    throw new VideoProviderError("Seedance skipped: missing SEEDANCE_API_KEY", {
      provider: "seedance",
      model
    });
  }

  const isImageToVideo =
    input.firstFrameUrl &&
    !input.firstFrameUrl.endsWith(".svg") &&
    !input.firstFrameUrl.includes("placeholder");

  const endpoint = isImageToVideo
    ? `${baseUrl}/videos/generations`
    : `${baseUrl}/videos/generations`;

  const body: Record<string, unknown> = {
    model,
    content: [
      ...(isImageToVideo
        ? [{ type: "image_url", image_url: { url: input.firstFrameUrl } }]
        : []),
      { type: "text", text: input.prompt.slice(0, 2500) }
    ],
    duration,
    resolution,
    watermark: false
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();

  if (!res.ok) {
    throw new VideoProviderError(
      `Seedance create task failed: HTTP ${res.status} ${res.statusText} — ${text.slice(0, 300)}`,
      { provider: "seedance", model }
    );
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new VideoProviderError(
      `Seedance response not JSON: ${text.slice(0, 200)}`,
      { provider: "seedance", model }
    );
  }

  const taskId = data?.id || data?.task_id;
  if (!taskId) {
    throw new VideoProviderError(
      `Seedance returned no task id: ${text.slice(0, 300)}`,
      { provider: "seedance", model, raw: data }
    );
  }

  console.log(`[seedance] Task created: ${taskId} (${isImageToVideo ? "i2v" : "t2v"})`);

  return {
    provider: "seedance",
    model,
    externalTaskId: taskId,
    generationType: isImageToVideo ? "image_to_video" : "text_to_video",
    raw: data
  };
}

export async function pollSeedanceVideoTask(
  input: PollVideoTaskInput
): Promise<PollVideoTaskResult> {
  const { apiKey, model, baseUrl } = getConfig();

  if (!apiKey) {
    return { ...input, status: "failed", errorMessage: "Missing SEEDANCE_API_KEY" };
  }

  const res = await fetch(`${baseUrl}/videos/generations/${input.externalTaskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  const text = await res.text();

  if (!res.ok) {
    return {
      ...input,
      status: "failed",
      errorMessage: `Seedance poll failed: HTTP ${res.status} — ${text.slice(0, 200)}`
    };
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...input, status: "failed", errorMessage: `Seedance poll non-JSON: ${text.slice(0, 100)}` };
  }

  // Volcano Ark status: "succeeded" | "running" | "failed" | "cancelled"
  const status: string = (data?.status || "").toLowerCase();

  if (status === "succeeded" || status === "completed") {
    const videoUrl: string | undefined =
      data?.video_url ||
      data?.choices?.[0]?.message?.content?.[0]?.video_url ||
      data?.output?.video_url;

    if (!videoUrl) {
      return {
        ...input,
        status: "failed",
        errorMessage: `Seedance succeeded but no video_url in response: ${text.slice(0, 300)}`
      };
    }

    return { ...input, status: "completed", videoUrl, rawStatus: status, raw: data };
  }

  if (status === "failed" || status === "cancelled") {
    const reason = data?.error?.message || data?.failure_reason || status;
    return { ...input, status: "failed", errorMessage: `Seedance task ${status}: ${reason}`, rawStatus: status };
  }

  // still running / queued / processing
  return { ...input, status: "pending", rawStatus: status };
}

/** Blocking poll used inside generateVideoForScene (legacy single-provider path) */
export async function generateSeedanceVideo(
  input: GenerateVideoInput
): Promise<{ videoUrl: string; taskId: string; model: string }> {
  const { model } = getConfig();
  const maxAttempts = Number(process.env.SEEDANCE_POLL_ATTEMPTS || process.env.PROVIDER_POLL_ATTEMPTS || 60);
  const intervalMs = Number(process.env.SEEDANCE_POLL_INTERVAL_MS || process.env.PROVIDER_POLL_INTERVAL_MS || 10000);

  const createResult = await createSeedanceVideoTask(input);

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);

    const poll = await pollSeedanceVideoTask({
      provider: "seedance",
      model,
      externalTaskId: createResult.externalTaskId,
      generationType: createResult.generationType
    });

    if (poll.status === "completed" && poll.videoUrl) {
      return { videoUrl: poll.videoUrl, taskId: createResult.externalTaskId, model };
    }

    if (poll.status === "failed") {
      throw new VideoProviderError(poll.errorMessage || "Seedance video failed", {
        provider: "seedance",
        model,
        externalTaskId: createResult.externalTaskId
      });
    }

    console.log(`[seedance] Poll ${i + 1}/${maxAttempts}: ${poll.rawStatus}`);
  }

  throw new VideoProviderError(
    `Seedance poll timeout after ${maxAttempts} attempts`,
    { provider: "seedance", model, externalTaskId: createResult.externalTaskId }
  );
}
