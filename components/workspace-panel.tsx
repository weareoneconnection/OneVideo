"use client";
import { useState } from "react";

type Member = { id: string; email: string; role: string; status: string; joinedAt: string | null };
type Workspace = { id: string; name: string; ownerId: string; members: Member[]; _count: { projects: number }; createdAt: string };

export function WorkspacePanel({
  owned, joined, currentUserEmail
}: { owned: Workspace[]; joined: Workspace[]; currentUserEmail: string }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [inviting, setInviting] = useState<string | null>(null);

  async function createWorkspace() {
    if (!newName.trim()) return;
    setLoading(true);
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName })
    });
    window.location.reload();
  }

  async function invite(workspaceId: string) {
    const email = inviteEmail[workspaceId];
    if (!email) return;
    setInviting(workspaceId);
    const res = await fetch(`/api/workspace/${workspaceId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.inviteUrl) {
      setInviteLinks(prev => ({ ...prev, [workspaceId]: data.inviteUrl }));
    }
    setInviting(null);
  }

  async function removeMember(workspaceId: string, memberId: string) {
    if (!confirm("确认移除该成员？")) return;
    await fetch(`/api/workspace/${workspaceId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId })
    });
    window.location.reload();
  }

  const allWorkspaces = [...owned, ...joined];

  return (
    <div>
      {/* 创建 */}
      <div className="mb-8">
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90"
          >
            + 创建团队空间
          </button>
        ) : (
          <div className="flex gap-3 max-w-sm">
            <input
              autoFocus
              className="flex-1 rounded-xl border border-line bg-panel p-3 text-sm outline-none focus:border-zinc-400"
              placeholder="团队名称"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createWorkspace()}
            />
            <button onClick={createWorkspace} disabled={loading} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
              {loading ? "创建中..." : "创建"}
            </button>
            <button onClick={() => setCreating(false)} className="rounded-xl border border-line px-3 py-2 text-sm">取消</button>
          </div>
        )}
      </div>

      {allWorkspaces.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel p-10 text-center text-muted">
          暂无团队空间。创建一个开始协作吧。
        </div>
      ) : (
        <div className="space-y-6">
          {allWorkspaces.map(ws => {
            const isOwner = owned.some(o => o.id === ws.id);
            return (
              <div key={ws.id} className="rounded-2xl border border-line bg-panel p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-semibold text-lg">{ws.name}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {isOwner ? "你是 Owner" : "成员"} · {ws._count.projects} 个项目 · {ws.members.length} 名成员
                    </div>
                  </div>
                  <a
                    href={`/dashboard/projects?workspaceId=${ws.id}`}
                    className="rounded-xl border border-line px-4 py-2 text-sm hover:border-white/40"
                  >
                    查看项目
                  </a>
                </div>

                {/* 成员列表 */}
                <div className="space-y-2 mb-4">
                  {ws.members.map(m => (
                    <div key={m.id} className="flex items-center justify-between rounded-xl border border-line bg-soft px-4 py-2.5 text-sm">
                      <div>
                        <span className="font-medium">{m.email}</span>
                        {m.email === currentUserEmail && <span className="ml-2 text-xs text-muted">(你)</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs rounded-full px-2 py-0.5 ${m.status === "active" ? "bg-green-950/50 text-green-400" : "bg-yellow-950/50 text-yellow-400"}`}>
                          {m.status === "active" ? m.role : "待加入"}
                        </span>
                        {isOwner && m.email !== currentUserEmail && (
                          <button onClick={() => removeMember(ws.id, m.id)} className="text-xs text-red-400 hover:text-red-300">移除</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 邀请 */}
                {isOwner && (
                  <div>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded-xl border border-line bg-soft p-2.5 text-sm outline-none focus:border-zinc-400"
                        placeholder="输入邮箱邀请成员"
                        value={inviteEmail[ws.id] || ""}
                        onChange={e => setInviteEmail(prev => ({ ...prev, [ws.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => invite(ws.id)}
                        disabled={inviting === ws.id}
                        className="rounded-xl border border-line px-4 py-2 text-sm hover:border-white/40 disabled:opacity-50"
                      >
                        {inviting === ws.id ? "生成中..." : "邀请"}
                      </button>
                    </div>
                    {inviteLinks[ws.id] && (
                      <div className="mt-2 rounded-xl border border-green-900/40 bg-green-950/30 px-4 py-2.5">
                        <div className="text-xs text-green-400 mb-1">邀请链接（发给成员）：</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted truncate flex-1">{inviteLinks[ws.id]}</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(inviteLinks[ws.id])}
                            className="text-xs text-green-400 hover:text-green-300 shrink-0"
                          >
                            复制
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
