import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateProjectVideoAggregate } from "@/lib/workflow";

export const runtime = "nodejs";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;
  const scene = await db.scene.findUnique({
    where: {
      id: sceneId
    }
  });

  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  if (!scene.videoUrl) {
    return NextResponse.json(
      {
        error: "Scene has no generated video to approve."
      },
      {
        status: 409
      }
    );
  }

  await db.scene.update({
    where: {
      id: sceneId
    },
    data: {
      status: "completed",
      reviewStatus: "approved",
      qualityNotes: scene.qualityNotes
        ? `${scene.qualityNotes}; manually approved`
        : "manually approved",
      errorMessage: null,
      completedAt: scene.completedAt || new Date()
    }
  });

  await updateProjectVideoAggregate(scene.projectId);

  return NextResponse.json({
    sceneId,
    projectId: scene.projectId,
    status: "approved"
  });
}

