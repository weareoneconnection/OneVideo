import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";

// DELETE /api/templates/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const user = await getOrCreateUser();
  const { templateId } = await params;
  const template = await db.template.findFirst({ where: { id: templateId, userId: user.id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.template.delete({ where: { id: templateId } });
  return NextResponse.json({ ok: true });
}

// POST /api/templates/:id/use — 点击"使用模板"，增加 usageCount，返回预填数据
export async function POST(_req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const template = await db.template.findUnique({ where: { id: templateId } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.template.update({ where: { id: templateId }, data: { usageCount: { increment: 1 } } });
  return NextResponse.json({ template });
}
