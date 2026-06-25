import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET — 列出成员
export async function GET(_req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const user = await getOrCreateUser();
  const { workspaceId } = await params;

  const isMember = await db.workspaceMember.findFirst({
    where: { workspaceId, userId: user.id, status: "active" }
  });
  if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await db.workspaceMember.findMany({ where: { workspaceId } });
  return NextResponse.json({ members });
}

// DELETE — 移除成员（仅 owner 可操作）
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const user = await getOrCreateUser();
  const { workspaceId } = await params;
  const { memberId } = await req.json();

  const workspace = await db.workspace.findFirst({ where: { id: workspaceId, ownerId: user.id } });
  if (!workspace) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.workspaceMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
