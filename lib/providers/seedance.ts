/**
 * Seedance (Doubao-Seed) via Volcano Engine Ark — Responses API
 *
 * 申请: https://console.volcengine.com/ark → 模型广场 → Doubao-Seed-2.1-pro
 *
 * 环境变量:
 *   SEEDANCE_API_KEY    — Ark API Key (以 "ark-" 开头)
 *   SEEDANCE_MODEL      — 模型ID, e.g. "doubao-seed-2-1-pro-260628"
 *   SEEDANCE_BASE_URL   — 可选，默认 https://ark.cn-beijing.volces.com/api/v3
 *   SEEDANCE_DURATION   — 视频时长秒 (可选，部分模型通过 prompt 控制)
 *   SEEDANCE_RESOLUTION — 分辨率，默认 "1080x1920" (9:16竖屏)
 *   SEEDANCE_POLL_ATTEMPTS   — 轮询次数，默认 60
 *   SEEDANCE_POLL_INTERVAL_MS — 轮询间隔ms，默认 10000
 */

import type {
  GenerateVideoInput,
  CreateVideoTaskResult,
  PollVideoTaskInput as _PollVideoTaskInput,
  PollVideoTaskResult
} from "../video-provider";

// Extend with internal raw field used by sync-result path
type PollVideoTaskInput = _PollVideoTaskInput & { raw?: unknown };
import { VideoProviderError } from "../video-provider";

function getConfig() {
  return {
    apiKey: process.env.SEEDANCE_API_KEY || "",
    model: process.env.SEEDANCE_MODEL || "doubao-seed-2-1-pro-260628",
    baseUrl: (process.env.SEEDANCE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, ""),
    duration: process.env.SEEDANCE_DURATION ? Number(process.env.SEEDANCE_DURATION) : undefined,
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
    Boolean(input.firstFrameUrl) &&
    !input.firstFrameUrl!.endsWith(".svg") &&
    !input.firstFrameUrl!.includes("placeholder");

  // Ark Responses API — 和截图中的格式完全一致
  const contentItems: Array<Record<string, unknown>> = [];

  if (isImageToVideo && input.firstFrameUrl) {
    contentItems.push({
      type: "input_image",
      image_url: input.firstFrameUrl
    });
  }

  // 附加分辨率/时长到 prompt（Seedance 通过 prompt 控制部分参数）
  let promptText = input.prompt.slice(0, 2500);
  const suffixParts: string[] = [];
  if (resolution) suffixParts.push(`Resolution: ${resolution}`);
  if (duration) suffixParts.push(`Duration: ${duration}s`);
  if (suffixParts.length > 0) promptText += `. [${suffixParts.join(", ")}]`;

  contentItems.push({
    type: "input_text",
    text: promptText
  });

  const body = {
    model,
    input: [
      {
        role: "user",
        content: contentItems
      }
    ]
  };

  const res = await fetch(`${baseUrl}/responses`, {
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

  // Ark Responses API 返回 { id, status, ... }
  const taskId: string = data?.id;
  if (!taskId) {
    throw new VideoProviderError(
      `Seedance returned no response id: ${text.slice(0, 300)}`,
      { provider: "seedance", model, raw: data }
    );
  }

  const status: string = (data?.status || "").toLowerCase();
  console.log(`[seedance] Task created: ${taskId}, status: ${status} (${isImageToVideo ? "i2v" : "t2v"})`);

  // 如果同步就返回了结果（status=completed），直接提取 video_url
  if (status === "completed") {
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
  // Ark Responses API 视频结果路径（根据官方文档）
  const output = data?.output;
  if (typeof output === "string" && output.startsWith("http")) return output;

  // output.content 数组中找 video 类型
  const content: any[] = output?.content || data?.choices?.[0]?.message?.content || [];
  for (const item of content) {
    if (item?.type === "video_url" && item?.video_url) return item.video_url;
    if (item?.type === "output_video" && item?.video_url) return item.video_url;
    if (item?.video_url) return item.video_url;
  }

  // 顶层 video_url 兜底
  return data?.video_url || data?.output?.video_url;
}

export async function pollSeedanceVideoTask(
  input: PollVideoTaskInput
): Promise<PollVideoTaskResult> {
  const { apiKey, model, baseUrl } = getConfig();

  if (!apiKey) {
    return { ...input, status: "failed", errorMessage: "Missing SEEDANCE_API_KEY" };
  }

  // 如果 create 阶段已经同步拿到 video_url，直接返回
  const syncUrl = (input as any).raw?._syncVideoUrl;
  if (syncUrl) {
    return { ...input, status: "completed", videoUrl: syncUrl, rawStatus: "completed" };
  }

  const res = await fetch(`${baseUrl}/responses/${input.externalTaskId}`, {
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

  // Ark status: "completed" | "in_progress" | "failed" | "cancelled" | "queued"
  const status: string = (data?.status || "").toLowerCase();

  if (status === "completed") {
    const videoUrl = extractVideoUrl(data);
    if (!videoUrl) {
      return {
        ...input,
        status: "failed",
        errorMessage: `Seedance completed but no video_url found. Raw: ${text.slice(0, 300)}`
      };
    }
    return { ...input, status: "completed", videoUrl, rawStatus: status, raw: data };
  }

  if (status === "failed" || status === "cancelled") {
    const reason = data?.error?.message || data?.last_error?.message || status;
    return {
      ...input,
      status: "failed",
      errorMessage: `Seedance task ${status}: ${reason}`,
      rawStatus: status
    };
  }

  // in_progress / queued / 其他
  return { ...input, status: "pending", rawStatus: status };
}

/** 阻塞式 poll（用于 legacy 单 provider 路径）*/
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
