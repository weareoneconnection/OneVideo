import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email() });

// POST — 邀请成员（返回邀请链接）
export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const user = await getOrCreateUser();
  const { workspaceId } = await params;

  const workspace = await db.workspace.findFirst({ where: { id: workspaceId, ownerId: user.id } });
  if (!workspace) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email } = schema.parse(await req.json());

  const inviteToken = randomBytes(24).toString("hex");

  const member = await db.workspaceMember.upsert({
    where: { workspaceId_email: { workspaceId, email } },
    update: { inviteToken, status: "pending" },
    create: { workspaceId, email, role: "member", status: "pending", inviteToken }
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteUrl = `${appUrl}/api/workspace/join?token=${inviteToken}`;

  return NextResponse.json({ member, inviteUrl });
}
