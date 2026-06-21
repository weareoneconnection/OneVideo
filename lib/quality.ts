export type SceneQualityInput = {
  provider: string;
  model: string;
  videoUrl: string;
  prompt: string;
  referenceImageUrl?: string;
  firstFrameUrl?: string;
  qaFrameUrl?: string;
  continuityAnchor?: string;
};

export type SceneQualityResult = {
  score: number;
  reviewStatus: "approved" | "needs_review";
  notes: string;
};

function getMinQualityScore() {
  return Number(process.env.VIDEO_QUALITY_MIN_SCORE || 70);
}

export function shouldBlockLowQualityScenes() {
  return process.env.VIDEO_QUALITY_BLOCK_RENDER === "true";
}

export function assessSceneVideoQuality(input: SceneQualityInput): SceneQualityResult {
  let score = 72;
  const notes: string[] = [];

  if (input.provider === "mock-provider") {
    score -= 22;
    notes.push("mock provider output is only suitable for workflow testing");
  }

  if (/^https?:\/\//i.test(input.videoUrl) || input.videoUrl.startsWith("/")) {
    score += 6;
  } else {
    score -= 18;
    notes.push("video url is not a usable public or local asset path");
  }

  if (input.prompt.length >= 650) {
    score += 8;
  } else {
    score -= 8;
    notes.push("prompt may be too short to enforce continuity");
  }

  if (input.referenceImageUrl) {
    score += 5;
  } else {
    notes.push("no project reference image attached");
  }

  if (input.firstFrameUrl) {
    score += 7;
  } else {
    notes.push("no scene first-frame asset attached");
  }

  if (input.qaFrameUrl) {
    score += 5;
  } else {
    notes.push("no extracted QA frame available");
  }

  if (input.continuityAnchor) {
    score += 6;
  } else {
    notes.push("no continuity anchor stored for this scene");
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  const reviewStatus =
    normalizedScore >= getMinQualityScore() ? "approved" : "needs_review";

  return {
    score: normalizedScore,
    reviewStatus,
    notes: notes.length > 0 ? notes.join("; ") : "automatic quality checks passed"
  };
}
