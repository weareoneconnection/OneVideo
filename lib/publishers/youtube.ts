const YOUTUBE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

export function getYouTubeAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID || "",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/youtube`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    access_type: "offline",
    prompt: "consent",
    state
  });
  return `${YOUTUBE_AUTH_URL}?${params}`;
}

export async function exchangeYouTubeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}> {
  const res = await fetch(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID || "",
      client_secret: process.env.YOUTUBE_CLIENT_SECRET || "",
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/youtube`
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`YouTube OAuth error: ${data.error_description || data.error}`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, scope: data.scope };
}

export async function refreshYouTubeToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID || "",
      client_secret: process.env.YOUTUBE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`YouTube refresh error: ${data.error_description}`);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export async function getYouTubeChannelInfo(accessToken: string): Promise<{ channelId: string; displayName: string }> {
  const res = await fetch(`${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  const channel = data.items?.[0];
  return { channelId: channel?.id, displayName: channel?.snippet?.title };
}

export async function publishToYouTube(input: {
  accessToken: string;
  videoUrl: string;
  title: string;
  description?: string;
  hashtags?: string[];
  privacyStatus?: "public" | "private" | "unlisted";
  madeForKids?: boolean;
}): Promise<{ videoId: string; videoUrl: string }> {
  // Step 1: 下载视频到 buffer（YouTube 不支持直接 URL pull）
  const videoRes = await fetch(input.videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to download video for YouTube upload: ${videoRes.status}`);
  const videoBuffer = await videoRes.arrayBuffer();

  const tags = (input.hashtags || []).map(t => t.replace(/^#/, ""));
  const description = [input.description || "", tags.map(t => `#${t}`).join(" ")].filter(Boolean).join("\n\n");

  // Step 2: 初始化 resumable upload
  const initRes = await fetch(
    `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(videoBuffer.byteLength)
      },
      body: JSON.stringify({
        snippet: {
          title: input.title.slice(0, 100),
          description: description.slice(0, 5000),
          tags: tags.slice(0, 500),
          categoryId: "22" // People & Blogs
        },
        status: {
          privacyStatus: input.privacyStatus || "public",
          madeForKids: input.madeForKids || false,
          selfDeclaredMadeForKids: input.madeForKids || false
        }
      })
    }
  );

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube upload init failed: no upload URL");

  // Step 3: 上传视频 bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(videoBuffer.byteLength) },
    body: videoBuffer
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`YouTube video upload failed: ${uploadRes.status} ${err}`);
  }

  const uploadData = await uploadRes.json();
  const videoId = uploadData.id;
  return { videoId, videoUrl: `https://www.youtube.com/shorts/${videoId}` };
}
