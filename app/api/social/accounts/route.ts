import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getOrCreateUser();
  const accounts = await db.socialAccount.findMany({
    where: { userId: user.id, isActive: true },
    select: { id: true, platform: true, platformUserId: true, platformUsername: true, tokenExpiresAt: true, createdAt: true }
  });
  return NextResponse.json({ accounts });
}

export async function DELETE(req: Request) {
  const user = await getOrCreateUser();
  const { accountId } = await req.json();
  await db.socialAccount.updateMany({
    where: { id: accountId, userId: user.id },
    data: { isActive: false }
  });
  return NextResponse.json({ ok: true });
}
