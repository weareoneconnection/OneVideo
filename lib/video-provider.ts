// Kling global concurrency limiter — avoid 429 when multiple scenes run in parallel
class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;
  constructor(private readonly limit: number) {}
  async acquire(): Promise<() => void> {
    if (this.running < this.limit) {
      this.running++;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => { this.running++; resolve(() => this.release()); });
    });
  }
  private release() {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}
const klingSemaphore = new Semaphore(Number(process.env.KLING_CONCURRENCY || 1));

export type GenerateVideoInput = {
  projectId: string;
  sceneId: string;
  sceneIndex: number;
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  referenceImageUrl?: string;
  firstFrameUrl?: string;
  continuityAnchor?: string;
};

export type GenerateVideoResult = {
  provider: string;
  model: string;
  videoUrl: string;
  externalTaskId?: string;
  raw?: unknown;
};

export type VideoGenerationType = "text_to_video" | "image_to_video";

export type CreateVideoTaskResult = {
  provider: string;
  model: string;
  externalTaskId: string;
  generationType: VideoGenerationType;
  raw?: unknown;
};

export type PollVideoTaskInput = {
  provider: string;
  model: string;
  externalTaskId: string;
  generationType: VideoGenerationType;
};

export type PollVideoTaskResult = {
  provider: string;
  model: string;
  externalTaskId: string;
  generationType: VideoGenerationType;
  status: "pending" | "completed" | "failed";
  rawStatus?: string;
  videoUrl?: string;
  errorMessage?: string;
  raw?: unknown;
};

export class VideoProviderError extends Error {
  details: {
    provider: string;
    model: string;
    externalTaskId?: string;
    raw?: unknown;
  };

  constructor(
    message: string,
    details: {
      provider: string;
      model: string;
      externalTaskId?: string;
      raw?: unknown;
    }
  ) {
    super(message);
    this.name = "VideoProviderError";
    this.details = details;
  }
}

const MOCK_VIDEOS = [
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://media.w3.org/2010/05/sintel/trailer.mp4"
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAspectRatio(aspectRatio: string) {
  if (aspectRatio === "9:16") return "9:16";
  if (aspectRatio === "16:9") return "16:9";
  if (aspectRatio === "1:1") return "1:1";

  return "9:16";
}

function normalizeDuration(durationSeconds: number) {
  if (durationSeconds <= 5) return 5;
  if (durationSeconds <= 10) return 10;

  return 10;
}

function shouldFallbackToMock() {
  return process.env.VIDEO_PROVIDER_FALLBACK_TO_MOCK === "true";
}

function shouldUseImageToVideo(input: GenerateVideoInput) {
  const imageUrl = getProviderAssetUrl(input);

  return (
    process.env.VIDEO_PROVIDER_USE_IMAGE_TO_VIDEO === "true" &&
    Boolean(imageUrl)
  );
}

function isLocalProviderUrl(url: string) {
  return /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/i.test(url);
}

function toProviderAssetUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return url;

  return `${appUrl.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

function getProviderAssetUrl(input: GenerateVideoInput) {
  const rawUrl = input.firstFrameUrl || input.referenceImageUrl;
  if (!rawUrl) return null;

  const url = toProviderAssetUrl(rawUrl);

  if (
    isLocalProviderUrl(url) &&
    process.env.ALLOW_LOCAL_PROVIDER_ASSETS !== "true"
  ) {
    console.warn("Image-to-video skipped because provider asset URL is local:", {
      url
    });
    return null;
  }

  return url;
}

function getKlingStatusPath(generationType: VideoGenerationType) {
  if (generationType === "image_to_video") {
    return (
      process.env.KLING_IMAGE_STATUS_PATH ||
      process.env.KLING_STATUS_PATH ||
      "/v1/videos/image2video/{taskId}"
    );
  }

  return process.env.KLING_STATUS_PATH || "/v1/videos/text2video/{taskId}";
}

async function failKlingOrFallback(input: {
  originalInput: GenerateVideoInput;
  message: string;
  model: string;
  externalTaskId?: string;
  raw?: unknown;
}): Promise<GenerateVideoResult> {
  if (shouldFallbackToMock()) {
    console.warn("Kling failed. Falling back to mock because VIDEO_PROVIDER_FALLBACK_TO_MOCK=true:", {
      message: input.message,
      externalTaskId: input.externalTaskId
    });

    return generateWithMock(input.originalInput);
  }

  throw new VideoProviderError(input.message, {
    provider: "kling",
    model: input.model,
    externalTaskId: input.externalTaskId,
    raw: input.raw
  });
}

function getVideoUrlFromKlingResponse(data: any): string | undefined {
  return (
    data.video_url ||
    data.videoUrl ||
    data.url ||
    data.result?.video_url ||
    data.result?.videoUrl ||
    data.result?.url ||
    data.data?.video_url ||
    data.data?.videoUrl ||
    data.data?.url ||
    data.data?.result?.video_url ||
    data.data?.result?.videoUrl ||
    data.data?.result?.url ||
    data.data?.task_result?.video_url ||
    data.data?.task_result?.videoUrl ||
    data.data?.task_result?.url ||
    data.data?.task_result?.videos?.[0]?.url ||
    data.data?.task_result?.videos?.[0]?.video_url ||
    data.data?.task_result?.videos?.[0]?.videoUrl ||
    data.data?.task_result?.videos?.[0]?.resource?.resource ||
    data.data?.works?.[0]?.resource?.resource ||
    data.data?.works?.[0]?.url ||
    data.data?.works?.[0]?.video_url ||
    data.data?.works?.[0]?.videoUrl
  );
}

function getTaskStatusFromKlingResponse(data: any): string | undefined {
  return (
    data.status ||
    data.task_status ||
    data.taskStatus ||
    data.data?.status ||
    data.data?.task_status ||
    data.data?.taskStatus
  );
}

function getTaskIdFromKlingCreateResponse(data: any): string | undefined {
  return (
    data.task_id ||
    data.taskId ||
    data.id ||
    data.data?.task_id ||
    data.data?.taskId ||
    data.data?.id
  );
}

function getRequestIdFromKlingCreateResponse(data: any): string | undefined {
  return (
    data.request_id ||
    data.requestId ||
    data.data?.request_id ||
    data.data?.requestId
  );
}

export async function generateVideoForScene(
  input: GenerateVideoInput
): Promise<GenerateVideoResult> {
  const provider = process.env.VIDEO_PROVIDER || "mock";

  if (provider === "kling") {
    return generateWithKling(input);
  }

  return generateWithMock(input);
}

async function generateWithMock(
  input: GenerateVideoInput
): Promise<GenerateVideoResult> {
  return {
    provider: "mock-provider",
    model: "mock-video-v1",
    videoUrl: MOCK_VIDEOS[input.sceneIndex % MOCK_VIDEOS.length],
    externalTaskId: `mock-task-${input.projectId}-${input.sceneId}`
  };
}

async function generateWithKling(
  input: GenerateVideoInput
): Promise<GenerateVideoResult> {
  const release = await klingSemaphore.acquire();
  let createResult: CreateVideoTaskResult;

  try {
    try {
      createResult = await createKlingVideoTask(input);
    } catch (error) {
      if (error instanceof VideoProviderError) {
        return failKlingOrFallback({
          originalInput: input,
          message: error.message,
          model: error.details.model,
          externalTaskId: error.details.externalTaskId,
          raw: error.details.raw
        });
      }
      throw error;
    }

    const baseUrl =
      process.env.KLING_BASE_URL || "https://api-singapore.klingai.com";
    const apiKey = process.env.KLING_API_KEY;

    if (!apiKey) {
      return failKlingOrFallback({
        originalInput: input,
        message: "Kling skipped: missing KLING_API_KEY",
        model: createResult.model
      });
    }

    const result = await pollKlingTextToVideoTask({
      baseUrl,
      apiKey,
      taskId: createResult.externalTaskId,
      generationType: createResult.generationType
    });

    if (!result.videoUrl) {
      return failKlingOrFallback({
        originalInput: input,
        message:
          result.errorMessage ||
          `Kling task completed without videoUrl: ${createResult.externalTaskId}`,
        model: createResult.model,
        externalTaskId: createResult.externalTaskId,
        raw: {
          createData: createResult.raw,
          pollData: result.raw
        }
      });
    }

    return {
      provider: "kling",
      model: createResult.model,
      videoUrl: result.videoUrl,
      externalTaskId: createResult.externalTaskId,
      raw: {
        createData: createResult.raw,
      pollData: result.raw
    }
  };
  } finally {
    release();
  }
}

async function createKlingVideoTask(
  input: GenerateVideoInput
): Promise<CreateVideoTaskResult> {
  const apiKey = process.env.KLING_API_KEY;
  const baseUrl =
    process.env.KLING_BASE_URL || "https://api-singapore.klingai.com";
  const model = process.env.KLING_MODEL || "kling-v1";
  const mode = process.env.KLING_MODE || "std";
  const useImageToVideo = shouldUseImageToVideo(input);
  const generationType: VideoGenerationType = useImageToVideo
    ? "image_to_video"
    : "text_to_video";

  if (!apiKey) {
    throw new VideoProviderError("Kling skipped: missing KLING_API_KEY", {
      provider: "kling",
      model
    });
  }

  const createUrl = `${baseUrl.replace(/\/$/, "")}${
    useImageToVideo
      ? process.env.KLING_IMAGE_TO_VIDEO_PATH || "/v1/videos/image2video"
      : "/v1/videos/text2video"
  }`;

  const requestBody: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    duration: normalizeDuration(input.durationSeconds),
    aspect_ratio: normalizeAspectRatio(input.aspectRatio),
    mode
  };

  if (useImageToVideo) {
    const imageField = process.env.KLING_IMAGE_FIELD || "image_url";
    requestBody[imageField] = getProviderAssetUrl(input);
  }

  console.log("Kling create request:", {
    createUrl,
    model,
    duration: requestBody.duration,
    aspect_ratio: requestBody.aspect_ratio,
    mode,
    generationType,
    hasReferenceImage: Boolean(input.referenceImageUrl),
    hasFirstFrame: Boolean(input.firstFrameUrl),
    promptPreview: input.prompt.slice(0, 160)
  });

  const maxRetries = Number(process.env.KLING_RATE_LIMIT_RETRIES || 4);
  const baseRetryDelayMs = Number(process.env.KLING_RATE_LIMIT_DELAY_MS || 30000);

  let createRes!: Response;
  let createText!: string;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    createText = await createRes.text();

    if (createRes.status !== 429) break;

    if (attempt < maxRetries) {
      const retryAfterHeader = createRes.headers.get("Retry-After");
      const waitMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : baseRetryDelayMs * Math.pow(2, attempt);
      console.warn(`Kling 429 rate limit, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
    }
  }

  if (!createRes!.ok) {
    throw new VideoProviderError(
      `Kling create video failed: HTTP ${createRes!.status} ${createRes!.statusText}`,
      {
        provider: "kling",
        model,
        raw: {
          body: createText!,
          createUrl
        }
      }
    );
  }

  let createData: any;

  try {
    createData = JSON.parse(createText!);
  } catch (error) {
    throw new VideoProviderError("Kling create response is not JSON", {
      provider: "kling",
      model,
      raw: {
        error,
        body: createText
      }
    });
  }

  console.log("Kling create response:", createData);

  const taskId = getTaskIdFromKlingCreateResponse(createData);
  const requestId = getRequestIdFromKlingCreateResponse(createData);

  /**
   * Kling 的 create response 里通常同时有：
   * - request_id: 本次请求 ID
   * - data.task_id: 真正的视频任务 ID
   *
   * 之前你日志里 poll 用的是 request_id，但真正应该优先保存 task_id。
   * 如果你的 Kling 文档要求用 request_id 查询，可以通过 .env 改：
   * KLING_POLL_ID_TYPE="request_id"
   */
  const pollIdType = process.env.KLING_POLL_ID_TYPE || "task_id";

  const pollId =
    pollIdType === "request_id"
      ? requestId || taskId
      : taskId || requestId;

  if (!pollId) {
    throw new VideoProviderError("Kling create video returned no task id or request id", {
      provider: "kling",
      model,
      raw: createData
    });
  }

  return {
    provider: "kling",
    model,
    externalTaskId: pollId,
    generationType,
    raw: createData
  };
}

async function createVideoTaskForProvider(
  provider: string,
  input: GenerateVideoInput
): Promise<CreateVideoTaskResult> {
  if (provider === "kling") {
    return createKlingVideoTask(input);
  }

  if (provider === "runway") {
    const { createRunwayVideoTask } = await import("./providers/runway");
    try {
      return await createRunwayVideoTask(input);
    } catch (err) {
      // Runway requires a real reference image (gen4_turbo). If none available,
      // fall back to Kling which supports text-to-video without an image.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("requires a reference image")) {
        console.warn(`Runway fallback to Kling: ${msg}`);
        return createKlingVideoTask(input);
      }
      throw err;
    }
  }

  if (provider === "heygen") {
    const { createHeyGenVideoTask } = await import("./providers/heygen");
    const { db } = await import("./db");
    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: { avatarId: true }
    });
    const avatarId = project?.avatarId;
    if (!avatarId) throw new Error("HeyGen requires avatarId on project");
    const scene = await db.scene.findUnique({
      where: { id: input.sceneId },
      select: { voiceover: true }
    });
    return createHeyGenVideoTask({ ...input, avatarId, voiceover: scene?.voiceover ?? undefined });
  }

  // mock / fallback
  return {
    provider: "mock-provider",
    model: "mock-video-v1",
    externalTaskId: `mock-task-${input.projectId}-${input.sceneId}`,
    generationType: "text_to_video",
    raw: {
      videoUrl: MOCK_VIDEOS[input.sceneIndex % MOCK_VIDEOS.length]
    }
  };
}

export async function createVideoTaskForScene(
  input: GenerateVideoInput
): Promise<CreateVideoTaskResult> {
  const chain = (process.env.VIDEO_PROVIDER_FALLBACK_CHAIN || process.env.VIDEO_PROVIDER || "mock")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let lastError: Error | undefined;
  for (const provider of chain) {
    try {
      return await createVideoTaskForProvider(provider, input);
    } catch (err) {
      console.warn(`[video-provider] Provider "${provider}" failed, trying next:`, err);
      lastError = err as Error;
    }
  }

  throw lastError ?? new VideoProviderError("All video providers failed", {
    provider: chain.join(","),
    model: "unknown"
  });
}

export async function pollVideoTaskForScene(
  input: PollVideoTaskInput
): Promise<PollVideoTaskResult> {
  if (input.provider === "mock-provider") {
    return {
      ...input,
      status: "completed",
      videoUrl: MOCK_VIDEOS[0],
      rawStatus: "completed"
    };
  }

  if (input.provider === "runway") {
    const { pollRunwayVideoTask } = await import("./providers/runway");
    return pollRunwayVideoTask(input);
  }

  if (input.provider === "heygen") {
    const { pollHeyGenVideoTask } = await import("./providers/heygen");
    return pollHeyGenVideoTask(input);
  }

  if (input.provider !== "kling") {
    return {
      ...input,
      status: "failed",
      errorMessage: `Unsupported provider poll: ${input.provider}`
    };
  }

  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) {
    return {
      ...input,
      status: "failed",
      errorMessage: "Kling skipped: missing KLING_API_KEY"
    };
  }

  const poll = await pollKlingVideoTaskOnce({
    baseUrl: process.env.KLING_BASE_URL || "https://api-singapore.klingai.com",
    apiKey,
    taskId: input.externalTaskId,
    generationType: input.generationType
  });

  return {
    ...input,
    ...poll
  };
}

async function pollKlingTextToVideoTask(input: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  generationType: VideoGenerationType;
}): Promise<{
  videoUrl?: string;
  raw?: unknown;
  errorMessage?: string;
}> {
  const maxAttempts = Number(process.env.KLING_POLL_ATTEMPTS || 24);
  const pollIntervalMs = Number(process.env.KLING_POLL_INTERVAL_MS || 5000);

  console.log("Kling poll config:", {
    maxAttempts,
    pollIntervalMs,
    generationType: input.generationType
  });

  for (let i = 0; i < maxAttempts; i++) {
    const poll = await pollKlingVideoTaskOnce(input);

    if (poll.status === "completed") {
      return {
        videoUrl: poll.videoUrl,
        raw: poll.raw
      };
    }

    if (poll.status === "failed") {
      return {
        raw: poll.raw,
        errorMessage: poll.errorMessage || `Kling task failed with status: ${poll.rawStatus}`
      };
    }

    await sleep(pollIntervalMs);
  }

  console.error("Kling task timeout:", {
    taskId: input.taskId,
    maxAttempts,
    pollIntervalMs
  });

  return {
    errorMessage: `Kling task timeout after ${maxAttempts} attempts`
  };
}

async function pollKlingVideoTaskOnce(input: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  generationType: VideoGenerationType;
}): Promise<Omit<PollVideoTaskResult, "provider" | "model" | "externalTaskId" | "generationType">> {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const statusPathTemplate = getKlingStatusPath(input.generationType);
  const statusUrl = `${baseUrl}${statusPathTemplate.replace(
    "{taskId}",
    input.taskId
  )}`;

  console.log("Kling poll URL:", statusUrl);

  const res = await fetch(statusUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.apiKey}`
    }
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("Kling poll failed:", {
      status: res.status,
      statusText: res.statusText,
      body: text,
      statusUrl
    });

    return {
      status: "failed",
      raw: text,
      errorMessage: `Kling poll failed: HTTP ${res.status} ${res.statusText}`
    };
  }

  let data: any;

  try {
    data = JSON.parse(text);
  } catch (error) {
    console.error("Kling poll response is not JSON:", {
      error,
      body: text
    });

    return {
      status: "failed",
      raw: text,
      errorMessage: "Kling poll response is not JSON"
    };
  }

  const status = getTaskStatusFromKlingResponse(data);
  const normalizedStatus = String(status || "").toLowerCase();
  const videoUrl = getVideoUrlFromKlingResponse(data);

  console.log("Kling task status:", {
    taskId: input.taskId,
    status,
    hasVideoUrl: Boolean(videoUrl)
  });

  const successStatuses = [
    "completed",
    "succeeded",
    "succeed",
    "success",
    "finished",
    "done"
  ];

  if (videoUrl || successStatuses.includes(normalizedStatus)) {
    if (!videoUrl) {
      console.error("Kling status is success but videoUrl is missing:", data);

      return {
        status: "failed",
        rawStatus: status,
        raw: data,
        errorMessage: "Kling status is success but videoUrl is missing"
      };
    }

    console.log("Kling video completed:", {
      taskId: input.taskId,
      status,
      videoUrl
    });

    return {
      status: "completed",
      rawStatus: status,
      videoUrl,
      raw: data
    };
  }

  if (["failed", "error", "cancelled", "canceled"].includes(normalizedStatus)) {
    console.error("Kling task failed:", data);

    return {
      status: "failed",
      rawStatus: status,
      raw: data,
      errorMessage: `Kling task failed with status: ${status}`
    };
  }

  return {
    status: "pending",
    rawStatus: status || "pending",
    raw: data
  };
}
