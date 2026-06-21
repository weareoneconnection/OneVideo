import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWorkerHealth } from "@/lib/worker-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      scenes: { orderBy: { sceneIndex: "asc" } },
      assets: true,
      modelTasks: true
    }
  });

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({
    project,
    workerHealth: await getWorkerHealth()
  });
}
