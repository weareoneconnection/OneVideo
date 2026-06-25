function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfig() {
  return {
    apiKey: process.env.SUNO_API_KEY || "",
    baseUrl: (process.env.SUNO_BASE_URL || "https://studio-api.suno.ai").replace(/\/$/, ""),
    pollIntervalMs: Number(process.env.SUNO_POLL_INTERVAL_MS || 15000),
    pollAttempts: Number(process.env.SUNO_POLL_ATTEMPTS || 24)
  };
}

// 免费备用音乐（按风格分类，来自 CC0/公域资源）
const FREESOUND_TRACKS: Record<string, string> = {
  cinematic: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Broke_For_Free/Directionless_EP/Broke_For_Free_-_01_-_Night_Owl.mp3",
  upbeat: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Kai_Engel/Satin/Kai_Engel_-_07_-_Satin.mp3",
  motivational: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Kai_Engel/Satin/Kai_Engel_-_07_-_Satin.mp3",
  default: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Broke_For_Free/Directionless_EP/Broke_For_Free_-_01_-_Night_Owl.mp3"
};

export function getFreesoundFallbackUrl(style?: string | null): string {
  if (!style) return FREESOUND_TRACKS.default;
  const key = Object.keys(FREESOUND_TRACKS).find((k) =>
    style.toLowerCase().includes(k)
  );
  return FREESOUND_TRACKS[key || "default"];
}

export function buildMusicPrompt(project: {
  topic: string;
  style?: string | null;
  platform: string;
  durationSeconds: number;
  language: string;
}): string {
  const platformLabel: Record<string, string> = {
    tiktok: "TikTok",
    douyin: "抖音",
    youtube_shorts: "YouTube Shorts",
    xiaohongshu: "小红书"
  };
  const platform = platformLabel[project.platform] || project.platform;
  const style = project.style || "cinematic motivational";
  const lang = project.language === "zh" ? "适合中文短视频" : "for short-form video";

  return `background music, no vocals, no lyrics, ${style}, ${platform} style, ${lang}, ${project.durationSeconds} seconds, seamless loop, high quality`;
}

export async function createSunoMusic(prompt: string): Promise<{ jobId: string }> {
  const cfg = getConfig();
  if (!cfg.apiKey) throw new Error("SUNO_API_KEY is not set");

  const res = await fetch(`${cfg.baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      make_instrumental: true,
      wait_audio: false
    })
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Suno generate failed: HTTP ${res.status} — ${text}`);

  const data: any = JSON.parse(text);
  // Suno API 返回数组，取第一个 id
  const jobId: string = Array.isArray(data) ? data[0]?.id : (data.id || data.job_id);
  if (!jobId) throw new Error(`Suno returned no job id: ${text}`);

  console.log("Suno music job created:", { jobId, prompt: prompt.slice(0, 80) });
  return { jobId };
}

export async function pollSunoMusic(jobId: string): Promise<{
  status: "pending" | "completed" | "failed";
  audioUrl?: string;
}> {
  const cfg = getConfig();
  if (!cfg.apiKey) return { status: "failed" };

  const res = await fetch(`${cfg.baseUrl}/api/get?ids=${jobId}`, {
    headers: { "Authorization": `Bearer ${cfg.apiKey}` }
  });

  if (!res.ok) return { status: "pending" };

  const data: any = await res.json();
  const item = Array.isArray(data) ? data[0] : data;
  const status: string = (item?.status || "").toLowerCase();
  const audioUrl: string | undefined = item?.audio_url;

  if (status === "complete" && audioUrl) return { status: "completed", audioUrl };
  if (["error", "failed"].includes(status)) return { status: "failed" };
  return { status: "pending" };
}
