import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { deleteElevenLabsVoice } from "@/lib/providers/elevenlabs";

export const runtime = "nodejs";

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ voiceId: string }> }
) {
  const user = await getOrCreateUser();
  const { voiceId } = await params;

  const voice = await db.voiceProfile.findUnique({ where: { id: voiceId } });
  if (!voice || voice.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteElevenLabsVoice(voice.elevenLabsVoiceId).catch(() => {});
  await db.voiceProfile.delete({ where: { id: voiceId } });

  // 若删除的是默认声音，把最新的声音设为默认
  if (voice.isDefault) {
    const next = await db.voiceProfile.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }
    });
    if (next) await db.voiceProfile.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ voiceId: string }> }
) {
  const user = await getOrCreateUser();
  const { voiceId } = await params;

  const voice = await db.voiceProfile.findUnique({ where: { id: voiceId } });
  if (!voice || voice.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.isDefault === true) {
    // 先取消其他默认
    await db.voiceProfile.updateMany({
      where: { userId: user.id, id: { not: voiceId } },
      data: { isDefault: false }
    });
  }

  const updated = await db.voiceProfile.update({
    where: { id: voiceId },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {})
    }
  });

  return NextResponse.json({ voice: updated });
}
