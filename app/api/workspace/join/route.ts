import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/workspace/join?token=xxx — 点邀请链接后跳转到此接受邀请
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/dashboard/workspace?error=invalid", req.url));

  const user = await getOrCreateUser();

  const member = await db.workspaceMember.findUnique({ where: { inviteToken: token } });
  if (!member || member.status === "active") {
    return NextResponse.redirect(new URL("/dashboard/workspace?error=expired", req.url));
  }

  await db.workspaceMember.update({
    where: { id: member.id },
    data: { userId: user.id, status: "active", joinedAt: new Date(), inviteToken: null }
  });

  return NextResponse.redirect(new URL(`/dashboard/workspace?joined=${member.workspaceId}`, req.url));
}
