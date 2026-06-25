const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

export function getTikTokAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || "",
    response_type: "code",
    scope: "user.info.basic,video.publish,video.upload",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/tiktok`,
    state
  });
  return `${TIKTOK_AUTH_URL}?${params}`;
}

export async function exchangeTikTokCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  openId: string;
  scope: string;
}> {
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/tiktok`
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`TikTok OAuth error: ${data.error_description || data.error}`);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    openId: data.open_id,
    scope: data.scope
  };
}

export async function refreshTikTokToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`TikTok refresh error: ${data.error_description}`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
}

export async function getTikTokUserInfo(accessToken: string): Promise<{ openId: string; displayName: string }> {
  const res = await fetch(`${TIKTOK_API_BASE}/user/info/?fields=open_id,display_name,avatar_url`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return { openId: data.data?.user?.open_id, displayName: data.data?.user?.display_name };
}

export async function publishToTikTok(input: {
  accessToken: string;
  videoUrl: string;
  title: string;
  description?: string;
  hashtags?: string[];
  privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
}): Promise<{ publishId: string }> {
  const caption = buildCaption(input.title, input.description, input.hashtags);

  // Step 1: 初始化上传，获取 upload_url
  const initRes = await fetch(`${TIKTOK_API_BASE}/post/publish/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: input.privacyLevel || "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: { source: "PULL_FROM_URL", video_url: input.videoUrl }
    })
  });

  const initData = await initRes.json();
  if (initData.error?.code && initData.error.code !== "ok") {
    throw new Error(`TikTok publish init failed: ${initData.error.message} (${initData.error.code})`);
  }

  return { publishId: initData.data?.publish_id };
}

export async function getTikTokPublishStatus(accessToken: string, publishId: string): Promise<{
  status: "PROCESSING_DOWNLOAD" | "PROCESSING_UPLOAD" | "SEND_TO_USER_INBOX" | "FAILED" | "PUBLISHED";
  failReason?: string;
  publiclyAvailable?: boolean;
  shareUrl?: string;
}> {
  const res = await fetch(`${TIKTOK_API_BASE}/post/publish/status/fetch/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ publish_id: publishId })
  });
  const data = await res.json();
  return {
    status: data.data?.status,
    failReason: data.data?.fail_reason,
    publiclyAvailable: data.data?.publicly_available,
    shareUrl: data.data?.share_url
  };
}

function buildCaption(title: string, description?: string, hashtags?: string[]): string {
  const tags = (hashtags || []).map(t => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return [title, description, tags].filter(Boolean).join("\n").trim();
}
