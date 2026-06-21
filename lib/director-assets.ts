import { db } from "./db";
import { generateImage } from "./image-provider";
import type { ShortVideoScript, StoryboardScene } from "./types";

type SceneRecord = {
  id: string;
  sceneIndex: number;
};

type VisualBible = NonNullable<ShortVideoScript["visualBible"]>;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, maxLength = 78) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function wrapText(value: string, maxLength = 30) {
  const chars = Array.from(value);
  const lines: string[] = [];

  for (let i = 0; i < chars.length; i += maxLength) {
    lines.push(chars.slice(i, i + maxLength).join(""));
  }

  return lines.slice(0, 5);
}

function renderTextBlock(input: {
  x: number;
  y: number;
  lines: string[];
  size?: number;
  fill?: string;
  lineHeight?: number;
}) {
  return input.lines
    .map((line, index) => {
      const y = input.y + index * (input.lineHeight || 32);
      return `<text x="${input.x}" y="${y}" font-size="${input.size || 24}" fill="${input.fill || "#f8fafc"}">${escapeXml(line)}</text>`;
    })
    .join("\n");
}

function renderReferenceSvg(input: {
  title: string;
  topic: string;
  visualBible: VisualBible;
}) {
  const props = input.visualBible.propAnchors.join(" / ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <rect width="720" height="1280" fill="#111827"/>
  <rect x="42" y="54" width="636" height="1172" rx="34" fill="#172033" stroke="#f8fafc" stroke-opacity="0.24"/>
  <text x="72" y="118" font-size="34" font-weight="700" fill="#f8fafc">${escapeXml(input.title)}</text>
  <text x="72" y="166" font-size="18" fill="#93c5fd">${escapeXml(truncate(input.topic, 56))}</text>
  <rect x="72" y="214" width="576" height="420" rx="24" fill="#2f3a4f"/>
  <circle cx="360" cy="354" r="92" fill="#f5c9a9"/>
  <path d="M254 620c22-118 68-176 106-176s84 58 106 176" fill="#334155"/>
  <path d="M284 320c40-68 112-70 154-8 8 20 6 54-8 72-26-34-102-33-140 0-18-18-20-44-6-64z" fill="#171717"/>
  <rect x="116" y="694" width="488" height="1" fill="#f8fafc" opacity="0.18"/>
  ${renderTextBlock({
    x: 86,
    y: 740,
    size: 24,
    fill: "#f8fafc",
    lines: wrapText(`主角：${input.visualBible.protagonist}`, 25)
  })}
  ${renderTextBlock({
    x: 86,
    y: 918,
    size: 22,
    fill: "#d1d5db",
    lines: wrapText(`服装：${input.visualBible.wardrobe}`, 28)
  })}
  ${renderTextBlock({
    x: 86,
    y: 1068,
    size: 22,
    fill: "#d1d5db",
    lines: wrapText(`道具：${props}`, 28)
  })}
</svg>`;
}

function renderSceneKeyframeSvg(input: {
  topic: string;
  scene: StoryboardScene;
  visualBible: VisualBible;
}) {
  const title = `Scene ${input.scene.sceneIndex}`;
  const beat = input.scene.storyBeat || input.scene.mood || "story beat";
  const entry = input.scene.entryState || "entry state";
  const exit = input.scene.exitState || "exit state";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#182236"/>
      <stop offset="1" stop-color="#30231c"/>
    </linearGradient>
  </defs>
  <rect width="720" height="1280" fill="url(#g)"/>
  <rect x="40" y="52" width="640" height="1176" rx="34" fill="#0b0f19" fill-opacity="0.68" stroke="#f8fafc" stroke-opacity="0.22"/>
  <text x="76" y="124" font-size="42" font-weight="800" fill="#f8fafc">${escapeXml(title)}</text>
  <text x="76" y="170" font-size="20" fill="#fbbf24">${escapeXml(truncate(beat, 42))}</text>
  <rect x="76" y="224" width="568" height="444" rx="26" fill="#263241"/>
  <circle cx="332" cy="380" r="82" fill="#f5c9a9"/>
  <path d="M244 640c28-128 72-188 110-188s82 60 110 188" fill="#475569"/>
  <rect x="426" y="300" width="132" height="216" rx="14" fill="#111827" stroke="#93c5fd" stroke-width="4"/>
  <path d="M448 346h88M448 386h58M448 426h74M448 466h46" stroke="#22c55e" stroke-width="8" stroke-linecap="round"/>
  <rect x="100" y="716" width="520" height="1" fill="#f8fafc" opacity="0.18"/>
  ${renderTextBlock({
    x: 84,
    y: 774,
    size: 24,
    fill: "#f8fafc",
    lines: wrapText(`入场：${entry}`, 25)
  })}
  ${renderTextBlock({
    x: 84,
    y: 944,
    size: 24,
    fill: "#e5e7eb",
    lines: wrapText(`出场：${exit}`, 25)
  })}
  ${renderTextBlock({
    x: 84,
    y: 1114,
    size: 20,
    fill: "#9ca3af",
    lines: wrapText(`连续锚点：${input.visualBible.protagonist}`, 31)
  })}
</svg>`;
}

function getVisualBible(script: ShortVideoScript) {
  return script.visualBible || {
    protagonist: "same grounded protagonist throughout the video",
    wardrobe: "consistent practical wardrobe",
    coreSetting: "consistent real-world setting",
    propAnchors: ["same phone", "same laptop"],
    visualStyle: "realistic documentary short video",
    cameraLanguage: "vertical handheld close and medium shots",
    colorAndLight: "cinematic but realistic practical lighting",
    continuityRules: ["same protagonist", "same wardrobe", "same props"],
    negativePrompt: "unrelated stock footage, random people, luxury cliches"
  };
}

export async function createDirectorAssets(input: {
  projectId: string;
  topic: string;
  script: ShortVideoScript;
  scenes: StoryboardScene[];
  sceneRecords: SceneRecord[];
}) {
  const visualBible = getVisualBible(input.script);
  const referenceImage = await generateImage({
    projectId: input.projectId,
    filenameBase: "director-reference",
    kind: "reference",
    prompt: [
      "Vertical cinematic reference portrait for one continuous AI short video.",
      `Topic: ${input.topic}.`,
      `Protagonist: ${visualBible.protagonist}.`,
      `Wardrobe: ${visualBible.wardrobe}.`,
      `Setting: ${visualBible.coreSetting}.`,
      `Props: ${visualBible.propAnchors.join(", ")}.`,
      `Style: ${visualBible.visualStyle}.`,
      `Camera: ${visualBible.cameraLanguage}.`,
      `Lighting: ${visualBible.colorAndLight}.`,
      `Avoid: ${visualBible.negativePrompt}.`
    ].join("\n"),
    fallbackSvg: renderReferenceSvg({
      title: input.script.title || "OneVideo Director Reference",
      topic: input.topic,
      visualBible
    })
  });
  const referenceUrl = referenceImage.url;

  await db.asset.upsert({
    where: {
      id: `${input.projectId}-director-reference`
    },
    update: {
      url: referenceUrl,
      mimeType: referenceImage.mimeType,
      metadata: {
        kind: "protagonist_reference",
        visualBible,
        provider: referenceImage.provider,
        model: referenceImage.model,
        raw: referenceImage.raw || null
      }
    },
    create: {
      id: `${input.projectId}-director-reference`,
      projectId: input.projectId,
      type: "reference_image",
      url: referenceUrl,
      mimeType: referenceImage.mimeType,
      metadata: {
        kind: "protagonist_reference",
        visualBible,
        provider: referenceImage.provider,
        model: referenceImage.model,
        raw: referenceImage.raw || null
      }
    }
  });

  await db.modelTask.create({
    data: {
      projectId: input.projectId,
      provider: referenceImage.provider,
      model: referenceImage.model,
      taskType: "reference_image",
      status: "completed",
      inputJson: {
        topic: input.topic,
        visualBible
      },
      outputJson: {
        url: referenceImage.url,
        mimeType: referenceImage.mimeType,
        raw: referenceImage.raw || null
      },
      completedAt: new Date()
    }
  });

  const sceneUpdates = [];

  for (const scene of input.scenes) {
    const sceneRecord = input.sceneRecords.find(
      (record) => record.sceneIndex === scene.sceneIndex
    );

    if (!sceneRecord) continue;

    const firstFrame = await generateImage({
      projectId: input.projectId,
      filenameBase: `scene-${scene.sceneIndex}-first-frame`,
      kind: "first_frame",
      prompt: [
        "Vertical cinematic first frame for an image-to-video scene.",
        `Topic: ${input.topic}.`,
        `Scene ${scene.sceneIndex}: ${scene.storyBeat || scene.mood || ""}.`,
        `Entry state: ${scene.entryState || ""}.`,
        `Exit state: ${scene.exitState || ""}.`,
        `Same protagonist: ${visualBible.protagonist}.`,
        `Wardrobe: ${visualBible.wardrobe}.`,
        `Setting: ${scene.location || visualBible.coreSetting}.`,
        `Props: ${visualBible.propAnchors.join(", ")}.`,
        `Camera: ${scene.cameraMotion || visualBible.cameraLanguage}.`,
        `Avoid: ${visualBible.negativePrompt}.`
      ].join("\n"),
      fallbackSvg: renderSceneKeyframeSvg({
        topic: input.topic,
        scene,
        visualBible
      })
    });
    const url = firstFrame.url;

    await db.asset.upsert({
      where: {
        id: `${sceneRecord.id}-first-frame`
      },
      update: {
        url,
        mimeType: firstFrame.mimeType,
        metadata: {
          kind: "scene_first_frame",
          sceneIndex: scene.sceneIndex,
          storyBeat: scene.storyBeat || null,
          entryState: scene.entryState || null,
          exitState: scene.exitState || null,
          provider: firstFrame.provider,
          model: firstFrame.model,
          raw: firstFrame.raw || null
        }
      },
      create: {
        id: `${sceneRecord.id}-first-frame`,
        projectId: input.projectId,
        sceneId: sceneRecord.id,
        type: "keyframe",
        url,
        mimeType: firstFrame.mimeType,
        metadata: {
          kind: "scene_first_frame",
          sceneIndex: scene.sceneIndex,
          storyBeat: scene.storyBeat || null,
          entryState: scene.entryState || null,
          exitState: scene.exitState || null,
          provider: firstFrame.provider,
          model: firstFrame.model,
          raw: firstFrame.raw || null
        }
      }
    });

    await db.modelTask.create({
      data: {
        projectId: input.projectId,
        sceneId: sceneRecord.id,
        provider: firstFrame.provider,
        model: firstFrame.model,
        taskType: "scene_first_frame",
        status: "completed",
        inputJson: {
          sceneIndex: scene.sceneIndex,
          storyBeat: scene.storyBeat || null,
          entryState: scene.entryState || null,
          exitState: scene.exitState || null,
          visualBible
        },
        outputJson: {
          url: firstFrame.url,
          mimeType: firstFrame.mimeType,
          raw: firstFrame.raw || null
        },
        completedAt: new Date()
      }
    });

    sceneUpdates.push(
      db.scene.update({
        where: {
          id: sceneRecord.id
        },
        data: {
          referenceImageUrl: referenceUrl,
          firstFrameUrl: url,
          imageUrl: url
        }
      })
    );
  }

  await Promise.all(sceneUpdates);

  return {
    visualBible,
    referenceUrl
  };
}
