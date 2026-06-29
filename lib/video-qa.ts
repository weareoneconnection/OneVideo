import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { db } from "./db";
import { ensureProjectPublicDir, getProjectPublicUrl } from "./file-storage";
import { publishProjectFile } from "./storage-provider";

const execFileAsync = promisify(execFile);

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function getFfprobeInput(videoUrl: string) {
  if (videoUrl.startsWith("/")) {
    return path.join(process.cwd(), "public", videoUrl);
  }

  return videoUrl;
}

// Extract the last frame of a video clip for I2V chain continuity
export async function extractLastFrame(input: {
  projectId: string;
  sceneId: string;
  sceneIndex: number;
  videoUrl: string;
}): Promise<{ url: string; localPath: string } | null> {
  try {
    const dir = await ensureProjectPublicDir(input.projectId);
    const filename = `scene-${input.sceneIndex}-last-frame.jpg`;
    const localPath = path.join(dir, filename);
    const localUrl = getProjectPublicUrl(input.projectId, filename);

    const videoInput = getFfprobeInput(input.videoUrl);

    // First get duration via ffprobe
    const { stdout } = await execFileAsync(
      process.env.FFPROBE_PATH || "ffprobe",
      [
        "-v", "quiet", "-show_entries", "format=duration",
        "-of", "csv=p=0", videoInput
      ]
    );
    const duration = parseFloat(stdout.trim()) || 5;
    // Seek to 0.3s before end to get the last stable frame
    const seekTs = Math.max(0, duration - 0.3).toFixed(2);

    await execFileAsync(getFfmpegPath(), [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", seekTs,
      "-i", videoInput,
      "-frames:v", "1",
      "-q:v", "2",
      localPath
    ]);

    const published = await publishProjectFile({
      projectId: input.projectId,
      filename,
      localPath,
      localUrl,
      contentType: "image/jpeg"
    });

    await db.asset.upsert({
      where: { id: `${input.sceneId}-last-frame` },
      update: { url: published.url, mimeType: "image/jpeg", metadata: { kind: "scene_last_frame", sceneIndex: input.sceneIndex, storage: published } },
      create: {
        id: `${input.sceneId}-last-frame`,
        projectId: input.projectId,
        sceneId: input.sceneId,
        type: "last_frame",
        url: published.url,
        mimeType: "image/jpeg",
        metadata: { kind: "scene_last_frame", sceneIndex: input.sceneIndex, storage: published }
      }
    });

    return { url: published.url, localPath };
  } catch (error) {
    console.error("Last frame extraction failed", {
      sceneId: input.sceneId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function extractSceneQaFrame(input: {
  projectId: string;
  sceneId: string;
  sceneIndex: number;
  videoUrl: string;
}) {
  if (process.env.VIDEO_QA_EXTRACT_FRAME === "false") return null;

  try {
    const dir = await ensureProjectPublicDir(input.projectId);
    const filename = `scene-${input.sceneIndex}-qa-frame.jpg`;
    const localPath = path.join(dir, filename);
    const localUrl = getProjectPublicUrl(input.projectId, filename);

    await execFileAsync(getFfmpegPath(), [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "0.5",
      "-i",
      getFfprobeInput(input.videoUrl),
      "-frames:v",
      "1",
      "-q:v",
      "3",
      localPath
    ]);

    const published = await publishProjectFile({
      projectId: input.projectId,
      filename,
      localPath,
      localUrl,
      contentType: "image/jpeg"
    });

    await db.asset.upsert({
      where: {
        id: `${input.sceneId}-qa-frame`
      },
      update: {
        url: published.url,
        mimeType: "image/jpeg",
        metadata: {
          kind: "scene_qa_frame",
          sceneIndex: input.sceneIndex,
          storage: published
        }
      },
      create: {
        id: `${input.sceneId}-qa-frame`,
        projectId: input.projectId,
        sceneId: input.sceneId,
        type: "qa_frame",
        url: published.url,
        mimeType: "image/jpeg",
        metadata: {
          kind: "scene_qa_frame",
          sceneIndex: input.sceneIndex,
          storage: published
        }
      }
    });

    return {
      url: published.url,
      localPath
    };
  } catch (error) {
    console.error("Scene QA frame extraction failed", {
      sceneId: input.sceneId,
      error: error instanceof Error ? error.message : String(error)
    });

    return null;
  }
}

