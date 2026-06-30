import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueSceneVideo } from "@/lib/queues/video-queue";

export const runtime = "nodejs";

// POST /api/projects/[projectId]/retry-pending
// Re-enqueues all scenes that are stuck in "pending" or "failed" status
export async function POST(
  _: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const scenes = await db.scene.findMany({
    where: {
      projectId,
      status: { in: ["pending", "failed"] }
    },
    orderBy: { sceneIndex: "asc" }
  });

  if (scenes.length === 0) {
    return NextResponse.json({ message: "No pending/failed scenes to retry", retried: 0 });
  }

  await db.scene.updateMany({
    where: { id: { in: scenes.map(s => s.id) } },
    data: { status: "pending", errorMessage: null, failedAt: null }
  });

  await db.project.update({
    where: { id: projectId },
    data: { status: "generating_video", errorMessage: null, failedAt: null, completedAt: null }
  });

  const jobs = await Promise.all(
    scenes.map(scene => enqueueSceneVideo(scene.id, "retry"))
  );

  return NextResponse.json({
    retried: scenes.length,
    sceneIds: scenes.map(s => s.id),
    jobIds: jobs.map(j => j.id)
  }, { status: 202 });
}
