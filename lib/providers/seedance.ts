/**
 * Seedance 2.0 via Volcano Engine Ark — Contents Generations API
 *
 * 申请: https://console.volcengine.com/ark → 模型广场 → Doubao-Seedance-2.0
 *
 * 环境变量:
 *   SEEDANCE_API_KEY    — Ark API Key (以 "ark-" 开头)
 *   SEEDANCE_MODEL      — 模型ID，默认 "doubao-seedance-2-0-260128"
 *   SEEDANCE_BASE_URL   — 可选，默认 https://ark.cn-beijing.volces.com/api/v3
 *   SEEDANCE_POLL_ATTEMPTS   — 轮询次数，默认 60
 *   SEEDANCE_POLL_INTERVAL_MS — 轮询间隔ms，默认 10000
 */

import type {
  GenerateVideoInput,
  CreateVideoTaskResult,
  PollVideoTaskInput,
  PollVideoTaskResult
} from "../video-provider";
import { VideoProviderError } from "../video-provider";

// Extend with internal raw field used for sync-result path
type PollVideoTaskInputExt = PollVideoTaskInput & { raw?: unknown };

function getConfig() {
  return {
    apiKey: process.env.SEEDANCE_API_KEY || "",
    model: process.env.SEEDANCE_MODEL || "doubao-seedance-2-0-260128",
    baseUrl: (process.env.SEEDANCE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "")
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createSeedanceVideoTask(
  input: GenerateVideoInput
): Promise<CreateVideoTaskResult> {
  const { apiKey, model, baseUrl } = getConfig();

  if (!apiKey) {
    throw new VideoProviderError("Seedance skipped: missing SEEDANCE_API_KEY", {
      provider: "seedance",
      model
    });
  }

  const isImageToVideo =
    Boolean(input.firstFrameUrl) &&
    !input.firstFrameUrl!.endsWith(".svg") &&
    !input.firstFrameUrl!.includes("placeholder");

  // 按截图格式：content 数组，type="text" + type="image_url"
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: input.prompt.slice(0, 2500)
    }
  ];

  if (isImageToVideo && input.firstFrameUrl) {
    content.push({
      type: "image_url",
      image_url: { url: input.firstFrameUrl }
    });
  }

  const body = { model, content };

  const res = await fetch(`${baseUrl}/contents/generations/tasks`, {
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

  const taskId: string = data?.id || data?.task_id;
  if (!taskId) {
    throw new VideoProviderError(
      `Seedance returned no task id: ${text.slice(0, 300)}`,
      { provider: "seedance", model, raw: data }
    );
  }

  const status: string = (data?.status || "").toLowerCase();
  console.log(`[seedance] Task created: ${taskId}, status: ${status} (${isImageToVideo ? "i2v" : "t2v"})`);

  // 同步完成时直接提取 video_url
  if (status === "succeeded" || status === "completed") {
    const videoUrl = extractVideoUrl(data);
    if (videoUrl) {
      return {
        provider: "seedance",
        model,
        externalTaskId: taskId,
        generationType: isImageToVideo ? "image_to_video" : "text_to_video",
        raw: { ...data, _syncVideoUrl: videoUrl }
      };
    }
  }

  return {
    provider: "seedance",
    model,
    externalTaskId: taskId,
    generationType: isImageToVideo ? "image_to_video" : "text_to_video",
    raw: data
  };
}

function extractVideoUrl(data: any): string | undefined {
  // 实测返回格式: { content: { video_url: "https://..." } }
  if (typeof data?.content?.video_url === "string") return data.content.video_url;
  return undefined;
}

export async function pollSeedanceVideoTask(
  input: PollVideoTaskInputExt
): Promise<PollVideoTaskResult> {
  const { apiKey, model, baseUrl } = getConfig();

  if (!apiKey) {
    return { ...input, status: "failed", errorMessage: "Missing SEEDANCE_API_KEY" };
  }

  // 同步阶段已拿到 video_url，直接返回
  const syncUrl = (input.raw as any)?._syncVideoUrl;
  if (syncUrl) {
    return { ...input, status: "completed", videoUrl: syncUrl, rawStatus: "completed" };
  }

  const res = await fetch(`${baseUrl}/contents/generations/tasks/${input.externalTaskId}`, {
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

  // Ark task status: "succeeded" | "running" | "failed" | "cancelled" | "queued"
  const status: string = (data?.status || "").toLowerCase();

  if (status === "succeeded" || status === "completed") {
    const videoUrl = extractVideoUrl(data);
    if (!videoUrl) {
      return {
        ...input,
        status: "failed",
        errorMessage: `Seedance succeeded but no video_url found. Raw: ${text.slice(0, 300)}`
      };
    }
    return { ...input, status: "completed", videoUrl, rawStatus: status, raw: data };
  }

  if (status === "failed" || status === "cancelled") {
    const reason = data?.error?.message || data?.failure_reason || status;
    return {
      ...input,
      status: "failed",
      errorMessage: `Seedance task ${status}: ${reason}`,
      rawStatus: status
    };
  }

  return { ...input, status: "pending", rawStatus: status };
}

/** 阻塞式 poll（用于本地测试）*/
export async function generateSeedanceVideo(
  input: GenerateVideoInput
): Promise<{ videoUrl: string; taskId: string; model: string }> {
  const { model } = getConfig();
  const maxAttempts = Number(
    process.env.SEEDANCE_POLL_ATTEMPTS || process.env.PROVIDER_POLL_ATTEMPTS || 60
  );
  const intervalMs = Number(
    process.env.SEEDANCE_POLL_INTERVAL_MS || process.env.PROVIDER_POLL_INTERVAL_MS || 10000
  );

  const createResult = await createSeedanceVideoTask(input);

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);

    const poll = await pollSeedanceVideoTask({
      provider: "seedance",
      model,
      externalTaskId: createResult.externalTaskId,
      generationType: createResult.generationType,
      raw: createResult.raw
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
