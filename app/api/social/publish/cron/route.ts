import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publishToTikTok, refreshTikTokToken } from "@/lib/publishers/tiktok";
import { publishToYouTube, refreshYouTubeToken } from "@/lib/publishers/youtube";

export const runtime = "nodejs";

// GET /api/social/publish/cron — 由 Vercel / Railway cron 每分钟调用
// 保护：需要 CRON_SECRET header
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 找所有到期的定时发布任务
  const due = await db.publishRecord.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() }
    },
    include: {
      socialAccount: true,
      project: { select: { id: true, finalVideoUrl: true, status: true } }
    },
    take: 20
  });

  let processed = 0;
  const errors: string[] = [];

  for (const record of due) {
    if (!record.project.finalVideoUrl || record.project.status !== "completed") {
      await db.publishRecord.update({ where: { id: record.id }, data: { status: "failed", errorMessage: "Video not ready" } });
      continue;
    }

    try {
      let accessToken = record.socialAccount.accessToken;

      // 刷新 token
      if (record.socialAccount.tokenExpiresAt && record.socialAccount.tokenExpiresAt.getTime() - Date.now() < 300_000) {
        if (record.socialAccount.platform === "tiktok" && record.socialAccount.refreshToken) {
          const r = await refreshTikTokToken(record.socialAccount.refreshToken);
          accessToken = r.accessToken;
          await db.socialAccount.update({ where: { id: record.socialAccount.id }, data: { accessToken: r.accessToken, refreshToken: r.refreshToken, tokenExpiresAt: new Date(Date.now() + r.expiresIn * 1000) } });
        } else if (record.socialAccount.platform === "youtube" && record.socialAccount.refreshToken) {
          const r = await refreshYouTubeToken(record.socialAccount.refreshToken);
          accessToken = r.accessToken;
          await db.socialAccount.update({ where: { id: record.socialAccount.id }, data: { accessToken: r.accessToken, tokenExpiresAt: new Date(Date.now() + r.expiresIn * 1000) } });
        }
      }

      await db.publishRecord.update({ where: { id: record.id }, data: { status: "uploading" } });

      let platformPostId: string | undefined;
      let platformPostUrl: string | undefined;

      if (record.socialAccount.platform === "tiktok") {
        const result = await publishToTikTok({
          accessToken,
          videoUrl: record.project.finalVideoUrl,
          title: record.title || "",
          description: record.description || undefined,
          hashtags: record.hashtags || [],
          privacyLevel: "PUBLIC_TO_EVERYONE"
        });
        platformPostId = result.publishId;
      } else if (record.socialAccount.platform === "youtube") {
        const result = await publishToYouTube({
          accessToken,
          videoUrl: record.project.finalVideoUrl,
          title: record.title || "",
          description: record.description || undefined,
          hashtags: record.hashtags || [],
          privacyStatus: "public"
        });
        platformPostId = result.videoId;
        platformPostUrl = result.videoUrl;
      }

      await db.publishRecord.update({
        where: { id: record.id },
        data: { status: "published", platformPostId, platformPostUrl, publishedAt: new Date() }
      });
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.publishRecord.update({ where: { id: record.id }, data: { status: "failed", errorMessage: msg } });
      errors.push(`${record.id}: ${msg}`);
    }
  }

  return NextResponse.json({ processed, total: due.length, errors });
}
