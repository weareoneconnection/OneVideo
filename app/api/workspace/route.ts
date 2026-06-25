import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET — 当前用户所属的所有 Workspace（自己拥有的 + 已加入的）
export async function GET() {
  const user = await getOrCreateUser();

  const owned = await db.workspace.findMany({
    where: { ownerId: user.id },
    include: { members: true, _count: { select: { projects: true } } }
  });

  const memberships = await db.workspaceMember.findMany({
    where: { userId: user.id, status: "active" },
    include: { workspace: { include: { members: true, _count: { select: { projects: true } } } } }
  });

  const joined = memberships.map(m => m.workspace).filter(w => w.ownerId !== user.id);

  return NextResponse.json({ owned, joined });
}

const createSchema = z.object({ name: z.string().min(2).max(50) });

// POST — 创建 Workspace
export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  const { name } = createSchema.parse(await req.json());

  const workspace = await db.workspace.create({
    data: {
      name,
      ownerId: user.id,
      members: {
        create: { email: user.email, userId: user.id, role: "owner", status: "active", joinedAt: new Date() }
      }
    },
    include: { members: true }
  });

  return NextResponse.json({ workspace });
}
