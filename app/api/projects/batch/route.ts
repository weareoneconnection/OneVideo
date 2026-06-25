import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateVariants } from "@/lib/oneai";
import { enqueueProjectWorkflow } from "@/lib/queues/project-queue";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  topic: z.string().min(3),
  platform: z.enum(["tiktok", "douyin", "youtube_shorts", "xiaohongshu"]).default("douyin"),
  language: z.enum(["zh", "en"]).default("zh"),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  durationSeconds: z.coerce.number().int().min(15).max(60).default(45),
  baseStyle: z.string().default("cinematic, realistic, short-video style"),
  variantCount: z.coerce.number().int().min(2).max(5).default(3),
  variantDimension: z.enum(["style", "hook", "duration"]).default("style"),
  voiceProfileId: z.string().optional()
});

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  const body = schema.parse(await req.json());

  // AI 生成变体配置
  const variants = await generateVariants({
    topic: body.topic,
    platform: body.platform,
    language: body.language,
    baseStyle: body.baseStyle,
    durationSeconds: body.durationSeconds,
    variantCount: body.variantCount,
    dimension: body.variantDimension
  });

  // 创建 batch 记录
  const batch = await db.projectBatch.create({
    data: {
      userId: user.id,
      topic: body.topic,
      variantCount: body.variantCount,
      variantDimension: body.variantDimension,
      status: "running"
    }
  });

  // 并行创建所有变体项目
  const projectIds: string[] = [];
  await Promise.all(
    variants.map(async (variant) => {
      const project = await db.project.create({
        data: {
          userId: user.id,
          topic: body.topic,
          platform: body.platform,
          language: body.language,
          aspectRatio: body.aspectRatio,
          durationSeconds: variant.durationSeconds ?? body.durationSeconds,
          style: variant.style,
          voiceProfileId: body.voiceProfileId || null,
          batchId: batch.id,
          variantIndex: variant.variantIndex,
          variantLabel: variant.variantLabel,
          selectedHook: variant.selectedHook || null,
          status: "created",
          progress: 0
        }
      });
      projectIds.push(project.id);
      await enqueueProjectWorkflow(project.id, "create");
    })
  );

  return NextResponse.json({ batchId: batch.id, projectIds }, { status: 202 });
}
