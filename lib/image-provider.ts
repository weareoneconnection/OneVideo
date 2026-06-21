import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureProjectPublicDir, getProjectPublicUrl } from "./file-storage";
import { publishProjectFile } from "./storage-provider";

export type GenerateImageInput = {
  projectId: string;
  filenameBase: string;
  prompt: string;
  fallbackSvg: string;
  kind: "reference" | "first_frame" | "cover" | "title_card";
};

export type GenerateImageResult = {
  provider: string;
  model: string;
  url: string;
  localPath: string;
  mimeType: string;
  raw?: unknown;
};

function getImageProvider() {
  return process.env.IMAGE_PROVIDER || "placeholder";
}

function shouldFallbackToPlaceholder() {
  return process.env.IMAGE_PROVIDER_FALLBACK_TO_PLACEHOLDER !== "false";
}

function getImageSize(kind: GenerateImageInput["kind"]) {
  if (kind === "cover" || kind === "title_card") return "1024x1536";
  return process.env.IMAGE_SIZE || "1024x1536";
}

function getDataUrlMime(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] || "image/png";
}

function extensionFromMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
}

async function writeAndPublish(input: {
  projectId: string;
  filename: string;
  bytes: Buffer | string;
  mimeType: string;
}) {
  const dir = await ensureProjectPublicDir(input.projectId);
  const localPath = path.join(dir, input.filename);
  const localUrl = getProjectPublicUrl(input.projectId, input.filename);

  await writeFile(localPath, input.bytes);

  const published = await publishProjectFile({
    projectId: input.projectId,
    filename: input.filename,
    localPath,
    localUrl,
    contentType: input.mimeType
  });

  return {
    localPath,
    url: published.url,
    storage: published
  };
}

async function generatePlaceholderImage(
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  const filename = `${input.filenameBase}.svg`;
  const written = await writeAndPublish({
    projectId: input.projectId,
    filename,
    bytes: input.fallbackSvg,
    mimeType: "image/svg+xml"
  });

  return {
    provider: "placeholder",
    model: "svg-director-card-v1",
    url: written.url,
    localPath: written.localPath,
    mimeType: "image/svg+xml",
    raw: {
      storage: written.storage
    }
  };
}

async function generateWithOpenAICompatible(
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  const apiKey = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("IMAGE_API_KEY or OPENAI_API_KEY is required when IMAGE_PROVIDER=openai.");
  }

  const baseUrl = process.env.IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const model = process.env.IMAGE_MODEL || "gpt-image-1";
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      size: getImageSize(input.kind),
      n: 1
    })
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Image generation failed: HTTP ${res.status} ${res.statusText} ${text}`);
  }

  const data = JSON.parse(text);
  const item = data?.data?.[0];

  if (!item?.b64_json && !item?.url) {
    throw new Error("Image generation response did not include b64_json or url.");
  }

  let bytes: Buffer;
  let mimeType = "image/png";

  if (item.b64_json) {
    bytes = Buffer.from(item.b64_json, "base64");
  } else {
    const imageRes = await fetch(item.url);
    if (!imageRes.ok) {
      throw new Error(`Generated image download failed: HTTP ${imageRes.status} ${imageRes.statusText}`);
    }

    const contentType = imageRes.headers.get("content-type");
    if (contentType) mimeType = contentType.split(";")[0];

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    bytes = buffer;

    if (item.url.startsWith("data:")) {
      mimeType = getDataUrlMime(item.url);
    }
  }

  const filename = `${input.filenameBase}.${extensionFromMime(mimeType)}`;
  const written = await writeAndPublish({
    projectId: input.projectId,
    filename,
    bytes,
    mimeType
  });

  return {
    provider: "openai-compatible-image",
    model,
    url: written.url,
    localPath: written.localPath,
    mimeType,
    raw: {
      storage: written.storage,
      response: {
        created: data?.created,
        usage: data?.usage || null
      }
    }
  };
}

export async function generateImage(
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  const provider = getImageProvider();

  if (provider === "openai") {
    try {
      return await generateWithOpenAICompatible(input);
    } catch (error) {
      if (!shouldFallbackToPlaceholder()) throw error;
      console.error("Image generation failed. Falling back to placeholder image.", error);
    }
  }

  return generatePlaceholderImage(input);
}

