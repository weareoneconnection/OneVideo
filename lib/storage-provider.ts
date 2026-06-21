import { readFile } from "node:fs/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type PublishProjectFileInput = {
  projectId: string;
  filename: string;
  localPath: string;
  localUrl: string;
  contentType?: string;
};

export type PublishedProjectFile = {
  url: string;
  storageProvider: string;
  raw?: Record<string, string | number | boolean | null>;
};

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function getPublicBaseUrl() {
  return process.env.STORAGE_PUBLIC_BASE_URL || process.env.PUBLIC_ASSET_BASE_URL;
}

function getStorageProvider() {
  return process.env.STORAGE_PROVIDER || "local";
}

function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required when STORAGE_PROVIDER=r2."
    );
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

async function publishToR2(input: PublishProjectFileInput): Promise<PublishedProjectFile> {
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = getPublicBaseUrl();

  if (!bucket || !publicBaseUrl) {
    throw new Error(
      "R2_BUCKET and STORAGE_PUBLIC_BASE_URL are required when STORAGE_PROVIDER=r2."
    );
  }

  const key = `projects/${input.projectId}/${input.filename}`;
  const bytes = await readFile(input.localPath);
  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: input.contentType || "application/octet-stream"
    })
  );

  return {
    url: `${stripTrailingSlash(publicBaseUrl)}/${key}`,
    storageProvider: "r2",
    raw: {
      bucket,
      key,
      contentType: input.contentType || "application/octet-stream"
    }
  };
}

export async function publishProjectFile(
  input: PublishProjectFileInput
): Promise<PublishedProjectFile> {
  const provider = getStorageProvider();

  if (provider === "r2") {
    return publishToR2(input);
  }

  if (provider === "http-put") {
    const uploadBaseUrl = process.env.STORAGE_UPLOAD_BASE_URL;
    const publicBaseUrl = getPublicBaseUrl();

    if (!uploadBaseUrl || !publicBaseUrl) {
      throw new Error(
        "STORAGE_UPLOAD_BASE_URL and STORAGE_PUBLIC_BASE_URL are required when STORAGE_PROVIDER=http-put."
      );
    }

    const key = `projects/${input.projectId}/${input.filename}`;
    const uploadUrl = `${stripTrailingSlash(uploadBaseUrl)}/${key}`;
    const bytes = await readFile(input.localPath);
    const headers: Record<string, string> = {
      "Content-Type": input.contentType || "application/octet-stream"
    };

    if (process.env.STORAGE_UPLOAD_TOKEN) {
      headers.Authorization = `Bearer ${process.env.STORAGE_UPLOAD_TOKEN}`;
    }

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers,
      body: bytes
    });

    if (!res.ok) {
      throw new Error(`Storage upload failed: HTTP ${res.status} ${res.statusText}`);
    }

    return {
      url: `${stripTrailingSlash(publicBaseUrl)}/${key}`,
      storageProvider: provider,
      raw: {
        uploadUrl,
        status: res.status
      }
    };
  }

  const publicBaseUrl = getPublicBaseUrl();

  if (publicBaseUrl) {
    return {
      url: `${stripTrailingSlash(publicBaseUrl)}${input.localUrl}`,
      storageProvider: "public-base"
    };
  }

  return {
    url: input.localUrl,
    storageProvider: "local"
  };
}