import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { publishToTikTok, refreshTikTokToken } from "@/lib/publishers/tiktok";
import { publishToYouTube, refreshYouTubeToken } from "@/lib/publishers/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  projectId: z.string(),
  socialAccountId: z.string(),
  title: z.string().min(1).max(150),
  description: z.string().max(2000).optional(),
  hashtags: z.array(z.string()).max(30).optional(),
  privacyLevel: z.enum(["public", "private", "unlisted", "friends_only"]).default("public"),
  scheduledAt: z.string().datetime().optional()
});

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  const body = schema.parse(await req.json());

  // 验证项目归属
  const project = await db.project.findUnique({
    where: { id: body.projectId },
    select: { id: true, userId: true, finalVideoUrl: true, title: true, topic: true, status: true }
  });
  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status !== "completed" || !project.finalVideoUrl) {
    return NextResponse.json({ error: "Video not ready yet" }, { status: 400 });
  }

  // 获取账号
  const account = await db.socialAccount.findFirst({
    where: { id: body.socialAccountId, userId: user.id, isActive: true }
  });
  if (!account) {
    return NextResponse.json({ error: "Social account not found" }, { status: 404 });
  }

  // 检查 token 是否快过期，自动刷新
  let accessToken = account.accessToken;
  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    try {
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
          data: { accessToken: refreshed.accessToken, tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000) }
        });
      }
    } catch {
      return NextResponse.json({ error: "Token expired. Please reconnect your account." }, { status: 401 });
    }
  }

  // 定时发布：仅创建记录，等 cron 触发
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && scheduledAt > new Date()) {
    const record = await db.publishRecord.create({
      data: {
        projectId: project.id,
        socialAccountId: account.id,
        platform: account.platform,
        status: "scheduled",
        title: body.title,
        description: body.description,
        hashtags: body.hashtags || [],
        scheduledAt
      }
    });
    return NextResponse.json({ record, scheduled: true });
  }

  // 立即发布
  const record = await db.publishRecord.create({
    data: {
      projectId: project.id,
      socialAccountId: account.id,
      platform: account.platform,
      status: "uploading",
      title: body.title,
      description: body.description,
      hashtags: body.hashtags || []
    }
  });

  // 执行发布（在 response 后异步执行避免超时，但这里直接等待）
  try {
    let platformPostId: string | undefined;
    let platformPostUrl: string | undefined;

    if (account.platform === "tiktok") {
      const tikTokPrivacy =
        body.privacyLevel === "public" ? "PUBLIC_TO_EVERYONE" :
        body.privacyLevel === "friends_only" ? "MUTUAL_FOLLOW_FRIENDS" :
        "SELF_ONLY";
      const result = await publishToTikTok({
        accessToken,
        videoUrl: project.finalVideoUrl!,
        title: body.title,
        description: body.description,
        hashtags: body.hashtags,
        privacyLevel: tikTokPrivacy
      });
      platformPostId = result.publishId;
      // TikTok 发布后异步处理，无法立即得到 post URL
    } else if (account.platform === "youtube") {
      const result = await publishToYouTube({
        accessToken,
        videoUrl: project.finalVideoUrl!,
        title: body.title,
        description: body.description,
        hashtags: body.hashtags,
        privacyStatus: body.privacyLevel === "friends_only" ? "unlisted" : (body.privacyLevel as "public" | "private" | "unlisted")
      });
      platformPostId = result.videoId;
      platformPostUrl = result.videoUrl;
    }

    await db.publishRecord.update({
      where: { id: record.id },
      data: { status: "published", platformPostId, platformPostUrl, publishedAt: new Date() }
    });

    return NextResponse.json({ ok: true, recordId: record.id, platformPostId, platformPostUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.publishRecord.update({ where: { id: record.id }, data: { status: "failed", errorMessage: msg } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await getOrCreateUser();
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await db.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project || project.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const records = await db.publishRecord.findMany({
    where: { projectId },
    include: { socialAccount: { select: { platform: true, platformUsername: true } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ records });
}
