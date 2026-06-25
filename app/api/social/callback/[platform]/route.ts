import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeTikTokCode, getTikTokUserInfo } from "@/lib/publishers/tiktok";
import { exchangeYouTubeCode, getYouTubeChannelInfo } from "@/lib/publishers/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?social_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?social_error=missing_params`);
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?social_error=invalid_state`);
  }

  // 找到对应的 DB user
  const user = await db.user.findFirst({ where: { id: userId } });
  if (!user) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?social_error=user_not_found`);
  }

  try {
    if (platform === "tiktok") {
      const tokens = await exchangeTikTokCode(code);
      const info = await getTikTokUserInfo(tokens.accessToken);
      await db.socialAccount.upsert({
        where: { userId_platform_platformUserId: { userId: user.id, platform: "tiktok", platformUserId: tokens.openId } },
        update: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          scope: tokens.scope,
          platformUsername: info.displayName,
          isActive: true
        },
        create: {
          userId: user.id,
          platform: "tiktok",
          platformUserId: tokens.openId,
          platformUsername: info.displayName,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          scope: tokens.scope
        }
      });
    } else if (platform === "youtube") {
      const tokens = await exchangeYouTubeCode(code);
      const info = await getYouTubeChannelInfo(tokens.accessToken);
      await db.socialAccount.upsert({
        where: { userId_platform_platformUserId: { userId: user.id, platform: "youtube", platformUserId: info.channelId } },
        update: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          scope: tokens.scope,
          platformUsername: info.displayName,
          isActive: true
        },
        create: {
          userId: user.id,
          platform: "youtube",
          platformUserId: info.channelId,
          platformUsername: info.displayName,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          scope: tokens.scope
        }
      });
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?social_connected=${platform}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Social callback error [${platform}]:`, msg);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?social_error=${encodeURIComponent(msg)}`);
  }
}
