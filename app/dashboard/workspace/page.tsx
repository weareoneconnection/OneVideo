import { Nav } from "@/components/nav";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { WorkspacePanel } from "@/components/workspace-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await getOrCreateUser();

  const ownedRaw = await db.workspace.findMany({
    where: { ownerId: user.id },
    include: { members: true, _count: { select: { projects: true } } }
  });

  const memberships = await db.workspaceMember.findMany({
    where: { userId: user.id, status: "active" },
    include: { workspace: { include: { members: true, _count: { select: { projects: true } } } } }
  });

  const joinedRaw = memberships
    .map(m => m.workspace)
    .filter(w => w.ownerId !== user.id);

  // Serialise dates for client
  const serialise = (w: any) => ({
    ...w,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    members: w.members.map((m: any) => ({
      ...m,
      invitedAt: m.invitedAt.toISOString(),
      joinedAt: m.joinedAt?.toISOString() ?? null
    }))
  });

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="text-3xl font-bold mb-8">团队协作</h1>
        <WorkspacePanel
          owned={ownedRaw.map(serialise)}
          joined={joinedRaw.map(serialise)}
          currentUserEmail={user.email}
        />
      </main>
    </>
  );
}
