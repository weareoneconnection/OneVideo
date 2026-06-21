import { writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { ensureProjectPublicDir, getProjectPublicUrl } from "./file-storage";
import { publishProjectFile } from "./storage-provider";

type PackagingProject = {
  id: string;
  title: string | null;
  topic: string;
};

type PackagingScene = {
  id: string;
  sceneIndex: number;
  durationSeconds: number;
  voiceover: string;
  storyBeat?: string | null;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(value: string, maxLength = 18) {
  const chars = Array.from(value);
  const lines: string[] = [];

  for (let i = 0; i < chars.length; i += maxLength) {
    lines.push(chars.slice(i, i + maxLength).join(""));
  }

  return lines.slice(0, 4);
}

function formatVttTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`
  ].join(":");
}

function renderTitleCardSvg(project: PackagingProject) {
  const title = project.title || "OneVideo";
  const lines = wrapText(title, 14);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <rect width="720" height="1280" fill="#050505"/>
  <rect x="54" y="80" width="612" height="1120" rx="36" fill="#111827" stroke="#f8fafc" stroke-opacity="0.28"/>
  <text x="84" y="166" font-size="20" fill="#22c55e">OneVideo Studio</text>
  ${lines
    .map((line, index) => {
      return `<text x="84" y="${500 + index * 72}" font-size="58" font-weight="800" fill="#f8fafc">${escapeXml(line)}</text>`;
    })
    .join("\n")}
  <text x="84" y="950" font-size="24" fill="#9ca3af">${escapeXml(project.topic.slice(0, 42))}</text>
</svg>`;
}

function renderCoverSvg(project: PackagingProject, scenes: PackagingScene[]) {
  const firstBeat = scenes[0]?.storyBeat || project.topic;
  const title = project.title || "OneVideo";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="cover" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="0.52" stop-color="#1f2937"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="720" height="1280" fill="url(#cover)"/>
  <rect x="56" y="96" width="608" height="1088" rx="40" fill="#000" fill-opacity="0.28" stroke="#fff" stroke-opacity="0.22"/>
  <text x="86" y="184" font-size="24" fill="#fbbf24">AI Short Video</text>
  ${wrapText(title, 12)
    .map((line, index) => `<text x="86" y="${456 + index * 78}" font-size="64" font-weight="900" fill="#f8fafc">${escapeXml(line)}</text>`)
    .join("\n")}
  <text x="86" y="902" font-size="28" fill="#d1d5db">${escapeXml(firstBeat.slice(0, 30))}</text>
  <text x="86" y="1038" font-size="20" fill="#94a3b8">Generated with OneVideo Director Engine</text>
</svg>`;
}

function buildSubtitleVtt(scenes: PackagingScene[]) {
  let cursor = 0;
  const blocks = scenes.map((scene, index) => {
    const start = cursor;
    const end = cursor + scene.durationSeconds;
    cursor = end;

    return [
      String(index + 1),
      `${formatVttTime(start)} --> ${formatVttTime(end)}`,
      scene.voiceover.trim()
    ].join("\n");
  });

  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

export async function createPackagingAssets(input: {
  project: PackagingProject;
  scenes: PackagingScene[];
}) {
  const dir = await ensureProjectPublicDir(input.project.id);
  const subtitleFilename = "subtitles.vtt";
  const titleCardFilename = "title-card.svg";
  const coverFilename = "cover.svg";
  const subtitleUrl = getProjectPublicUrl(input.project.id, subtitleFilename);
  const titleCardUrl = getProjectPublicUrl(input.project.id, titleCardFilename);
  const coverUrl = getProjectPublicUrl(input.project.id, coverFilename);

  await writeFile(
    path.join(dir, subtitleFilename),
    buildSubtitleVtt(input.scenes),
    "utf8"
  );
  await writeFile(
    path.join(dir, titleCardFilename),
    renderTitleCardSvg(input.project),
    "utf8"
  );
  await writeFile(
    path.join(dir, coverFilename),
    renderCoverSvg(input.project, input.scenes),
    "utf8"
  );

  const subtitlePublished = await publishProjectFile({
    projectId: input.project.id,
    filename: subtitleFilename,
    localPath: path.join(dir, subtitleFilename),
    localUrl: subtitleUrl,
    contentType: "text/vtt"
  });
  const titleCardPublished = await publishProjectFile({
    projectId: input.project.id,
    filename: titleCardFilename,
    localPath: path.join(dir, titleCardFilename),
    localUrl: titleCardUrl,
    contentType: "image/svg+xml"
  });
  const coverPublished = await publishProjectFile({
    projectId: input.project.id,
    filename: coverFilename,
    localPath: path.join(dir, coverFilename),
    localUrl: coverUrl,
    contentType: "image/svg+xml"
  });

  await db.asset.upsert({
    where: {
      id: `${input.project.id}-subtitles`
    },
    update: {
      url: subtitlePublished.url,
      mimeType: "text/vtt",
      metadata: {
        kind: "subtitle_track",
        format: "webvtt",
        storage: subtitlePublished
      }
    },
    create: {
      id: `${input.project.id}-subtitles`,
      projectId: input.project.id,
      type: "subtitle",
      url: subtitlePublished.url,
      mimeType: "text/vtt",
      metadata: {
        kind: "subtitle_track",
        format: "webvtt",
        storage: subtitlePublished
      }
    }
  });

  await db.asset.upsert({
    where: {
      id: `${input.project.id}-title-card`
    },
    update: {
      url: titleCardPublished.url,
      mimeType: "image/svg+xml",
      metadata: {
        kind: "title_card",
        storage: titleCardPublished
      }
    },
    create: {
      id: `${input.project.id}-title-card`,
      projectId: input.project.id,
      type: "title_card",
      url: titleCardPublished.url,
      mimeType: "image/svg+xml",
      metadata: {
        kind: "title_card",
        storage: titleCardPublished
      }
    }
  });

  await db.asset.upsert({
    where: {
      id: `${input.project.id}-cover`
    },
    update: {
      url: coverPublished.url,
      mimeType: "image/svg+xml",
      metadata: {
        kind: "cover",
        storage: coverPublished
      }
    },
    create: {
      id: `${input.project.id}-cover`,
      projectId: input.project.id,
      type: "cover",
      url: coverPublished.url,
      mimeType: "image/svg+xml",
      metadata: {
        kind: "cover",
        storage: coverPublished
      }
    }
  });

  return {
    subtitleUrl: subtitlePublished.url,
    titleCardUrl: titleCardPublished.url,
    coverUrl: coverPublished.url
  };
}
