import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { enqueueProjectWorkflow } from "@/lib/queues/project-queue";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  topic: z.string().min(3),
  platform: z.enum(["tiktok", "douyin", "youtube_shorts", "xiaohongshu"]).default("tiktok"),
  language: z.enum(["zh", "en"]).default("zh"),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  durationSeconds: z.coerce.number().int().min(15).max(60).default(45),
  style: z.string().optional()
});

export async function GET() {
  const user = await getOrCreateUser();
  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { scenes: true }
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = createProjectSchema.parse(await req.json());
  const user = await getOrCreateUser();

  const project = await db.project.create({
    data: {
      userId: user.id,
      topic: body.topic,
      platform: body.platform,
      language: body.language,
      aspectRatio: body.aspectRatio,
      durationSeconds: body.durationSeconds,
      style: body.style || "cinematic, realistic, commercial short-video style",
      status: "created",
      progress: 0
    }
  });

  try {
    const job = await enqueueProjectWorkflow(project.id, "create");
    const queuedProject = await db.project.findUnique({
      where: {
        id: project.id
      }
    });

    return NextResponse.json(
      {
        projectId: project.id,
        jobId: job.id,
        project: queuedProject
      },
      {
        status: 202
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.project.update({
      where: {
        id: project.id
      },
      data: {
        status: "failed",
        progress: 100,
        errorMessage: `Queue failed: ${message}`,
        failedAt: new Date()
      }
    });

    return NextResponse.json(
      {
        error: "Project was created, but the generation queue failed.",
        projectId: project.id,
        details: message
      },
      {
        status: 503
      }
    );
  }
}
