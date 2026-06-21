import { mkdir } from "node:fs/promises";
import path from "node:path";

export function getProjectPublicDir(projectId: string) {
  return path.join(process.cwd(), "public", "generated", "projects", projectId);
}

export function getProjectPublicUrl(projectId: string, filename: string) {
  return `/generated/projects/${projectId}/${filename}`;
}

export async function ensureProjectPublicDir(projectId: string) {
  const dir = getProjectPublicDir(projectId);
  await mkdir(dir, {
    recursive: true
  });

  return dir;
}
