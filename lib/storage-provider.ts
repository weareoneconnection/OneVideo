import { readFile } from "node:fs/promises";

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

export async function publishProjectFile(
  input: PublishProjectFileInput
): Promise<PublishedProjectFile> {
  const provider = getStorageProvider();

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
