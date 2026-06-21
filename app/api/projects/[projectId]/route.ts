import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueProjectWorkflow } from "@/lib/queues/project-queue";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { sceneIndex: "asc" } }, assets: true, modelTasks: true }
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function POST(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await db.project.findUnique({
    where: { id: projectId }
  });

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const job = await enqueueProjectWorkflow(projectId, "retry");
    return NextResponse.json({ projectId, jobId: job.id }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.project.update({
      where: {
        id: projectId
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
        error: "Generation queue failed.",
        details: message
      },
      {
        status: 503
      }
    );
  }
}
