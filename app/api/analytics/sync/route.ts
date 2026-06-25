import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { refreshTikTokToken } from "@/lib/publishers/tiktok";
import { refreshYouTubeToken } from "@/lib/publishers/youtube";
import { getTikTokVideoStats } from "@/lib/publishers/tiktok";
import { getYouTubeVideoStats } from "@/lib/publishers/youtube";

export const runtime = "nodejs";

// POST /api/analytics/sync?projectId=xxx  — 同步单个项目或所有项目
export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;

  const where = projectId
    ? { projectId, project: { userId: user.id } }
    : { project: { userId: user.id }, platformPostId: { not: null }, status: "published" };

  const records = await db.publishRecord.findMany({
    where,
    include: { socialAccount: true }
  });

  let synced = 0;
  const errors: string[] = [];

  for (const record of records) {
    if (!record.platformPostId) continue;

    try {
      let account = record.socialAccount;
      let accessToken = account.accessToken;

      // 刷新过期 token
      if (account.tokenExpiresAt && account.tokenExpiresAt < new Date(Date.now() + 60_000)) {
        if (account.platform === "tiktok" && account.refreshToken) {
          const refreshed = await refreshTikTokToken(account.refreshToken);
          accessToken = refreshed.accessToken;
          await db.socialAccount.update({
            where: { id: account.id },
            data: {
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000)
            }
          });
        } else if (account.platform === "youtube" && account.refreshToken) {
          const refreshed = await refreshYouTubeToken(account.refreshToken);
          accessToken = refreshed.accessToken;
          await db.socialAccount.update({
            where: { id: account.id },
            data: {
              accessToken: refreshed.accessToken,
              tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000)
            }
          });
        }
      }

      let stats: { viewCount: number; likeCount: number; commentCount: number; shareCount?: number };

      if (account.platform === "tiktok") {
        stats = await getTikTokVideoStats(accessToken, record.platformPostId);
      } else if (account.platform === "youtube") {
        stats = await getYouTubeVideoStats(accessToken, record.platformPostId);
      } else {
        continue;
      }

      await db.publishRecord.update({
        where: { id: record.id },
        data: {
          viewCount: stats.viewCount,
          likeCount: stats.likeCount,
          commentCount: stats.commentCount,
          shareCount: stats.shareCount ?? null,
          lastSyncAt: new Date()
        }
      });
      synced++;
    } catch (err) {
      errors.push(`${record.platform}:${record.platformPostId} — ${err}`);
    }
  }

  return NextResponse.json({ synced, total: records.length, errors });
}
