import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueSceneVideo } from "@/lib/queues/video-queue";

export const runtime = "nodejs";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;
  const scene = await db.scene.findUnique({
    where: {
      id: sceneId
    },
    include: {
      project: true
    }
  });

  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  const job = await enqueueSceneVideo(sceneId, "retry");

  await db.project.update({
    where: {
      id: scene.projectId
    },
    data: {
      status: "generating_video",
      errorMessage: null,
      completedAt: null,
      failedAt: null
    }
  });

  return NextResponse.json(
    {
      sceneId,
      projectId: scene.projectId,
      jobId: job.id
    },
    {
      status: 202
    }
  );
}
