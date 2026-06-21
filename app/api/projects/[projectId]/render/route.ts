import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueRenderProject } from "@/lib/queues/video-queue";

export const runtime = "nodejs";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await db.project.findUnique({
    where: {
      id: projectId
    },
    include: {
      scenes: true
    }
  });

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const incompleteScenes = project.scenes.filter((scene) => scene.status !== "completed");

  if (incompleteScenes.length > 0) {
    return NextResponse.json(
      {
        error: "All scenes must be completed before rendering.",
        incompleteScenes: incompleteScenes.map((scene) => scene.id)
      },
      {
        status: 409
      }
    );
  }

  const job = await enqueueRenderProject(projectId, "retry");

  return NextResponse.json(
    {
      projectId,
      jobId: job?.id || null
    },
    {
      status: 202
    }
  );
}
