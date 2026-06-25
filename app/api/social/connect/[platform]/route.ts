import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTikTokAuthUrl } from "@/lib/publishers/tiktok";
import { getYouTubeAuthUrl } from "@/lib/publishers/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { platform } = await params;
  // state encodes userId + platform for CSRF protection
  const state = Buffer.from(JSON.stringify({ userId, platform, ts: Date.now() })).toString("base64url");

  let authUrl: string;
  switch (platform) {
    case "tiktok":
      if (!process.env.TIKTOK_CLIENT_KEY) {
        return NextResponse.json({ error: "TikTok app not configured. Set TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET." }, { status: 503 });
      }
      authUrl = getTikTokAuthUrl(state);
      break;
    case "youtube":
      if (!process.env.YOUTUBE_CLIENT_ID) {
        return NextResponse.json({ error: "YouTube app not configured. Set YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET." }, { status: 503 });
      }
      authUrl = getYouTubeAuthUrl(state);
      break;
    default:
      return NextResponse.json({ error: `Platform "${platform}" not supported` }, { status: 400 });
  }

  return NextResponse.redirect(authUrl);
}
