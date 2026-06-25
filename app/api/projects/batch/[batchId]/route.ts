import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const user = await getOrCreateUser();
  const { batchId } = await params;

  const batch = await db.projectBatch.findUnique({
    where: { id: batchId },
    include: {
      projects: {
        include: { scenes: { orderBy: { sceneIndex: "asc" } } },
        orderBy: { variantIndex: "asc" }
      }
    }
  });

  if (!batch || batch.userId !== user.id) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}
