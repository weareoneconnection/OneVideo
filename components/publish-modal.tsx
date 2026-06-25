"use client";

import { useState, useEffect } from "react";

type SocialAccount = {
  id: string;
  platform: string;
  platformUsername: string | null;
  tokenExpiresAt: string | null;
};

type PublishRecord = {
  id: string;
  platform: string;
  status: string;
  platformPostUrl: string | null;
  publishedAt: string | null;
  socialAccount: { platform: string; platformUsername: string | null };
};

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> = {
  tiktok: { label: "TikTok / 抖音", color: "text-pink-400", icon: "🎵" },
  youtube: { label: "YouTube Shorts", color: "text-red-400", icon: "▶" }
};

export function PublishModal({
  projectId,
  projectTitle,
  projectTopic,
  isOpen,
  onClose
}: {
  projectId: string;
  projectTitle?: string | null;
  projectTopic: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [records, setRecords] = useState<PublishRecord[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [title, setTitle] = useState(projectTitle || projectTopic.slice(0, 80));
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "private" | "unlisted">("public");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ url?: string; platform: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/social/accounts").then(r => r.json()).then(d => setAccounts(d.accounts || []));
    fetch(`/api/social/publish?projectId=${projectId}`).then(r => r.json()).then(d => setRecords(d.records || []));
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  async function publish() {
    if (!selectedAccountId) { setError("请先选择要发布的平台账号"); return; }
    setPublishing(true);
    setError("");
    setSuccess(null);
    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          socialAccountId: selectedAccountId,
          title,
          description: description || undefined,
          hashtags: hashtags.split(/[\s,#]+/).filter(Boolean),
          privacyLevel: privacy
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发布失败");
      const acc = accounts.find(a => a.id === selectedAccountId);
      setSuccess({ url: data.platformPostUrl, platform: acc?.platform || "" });
      // 刷新发布记录
      fetch(`/api/social/publish?projectId=${projectId}`).then(r => r.json()).then(d => setRecords(d.records || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布失败，请重试");
    } finally {
      setPublishing(false);
    }
  }

  const connectedPlatforms = new Set(accounts.map(a => a.platform));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl border border-line bg-panel p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">一键发布</h2>
          <button onClick={onClose} className="text-muted hover:text-white text-xl">✕</button>
        </div>

        {/* 平台连接状态 */}
        <div className="mb-5">
          <p className="text-sm text-muted mb-3">已连接的平台</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PLATFORM_META).map(([key, meta]) => (
              <div key={key} className={`rounded-xl border p-3 flex items-center justify-between ${connectedPlatforms.has(key) ? "border-line bg-soft" : "border-dashed border-line/50 opacity-60"}`}>
                <div className="flex items-center gap-2">
                  <span>{meta.icon}</span>
                  <span className="text-sm">{meta.label}</span>
                </div>
                {connectedPlatforms.has(key) ? (
                  <span className="text-xs text-green-400">已连接</span>
                ) : (
                  <a href={`/api/social/connect/${key}`} className="text-xs text-violet-400 hover:underline">
                    连接 →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {accounts.length > 0 ? (
          <>
            {/* 账号选择 */}
            <div className="mb-4">
              <label className="text-sm text-muted mb-2 block">选择发布账号</label>
              <div className="space-y-2">
                {accounts.map(acc => {
                  const meta = PLATFORM_META[acc.platform];
                  return (
                    <label key={acc.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${selectedAccountId === acc.id ? "border-white/50 bg-white/5" : "border-line bg-soft"}`}>
                      <input type="radio" name="account" value={acc.id} checked={selectedAccountId === acc.id} onChange={() => setSelectedAccountId(acc.id)} className="accent-white" />
                      <span>{meta?.icon}</span>
                      <div>
                        <div className="text-sm font-medium">{acc.platformUsername || acc.platform}</div>
                        <div className="text-xs text-muted">{meta?.label}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 发布内容 */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-muted">标题</label>
                <input className="mt-1 w-full rounded-xl border border-line bg-soft p-3 text-sm outline-none focus:border-zinc-400" value={title} onChange={e => setTitle(e.target.value)} maxLength={150} />
              </div>
              <div>
                <label className="text-xs text-muted">描述（可选）</label>
                <textarea className="mt-1 h-20 w-full rounded-xl border border-line bg-soft p-3 text-sm outline-none focus:border-zinc-400" value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} />
              </div>
              <div>
                <label className="text-xs text-muted">话题标签（用空格或逗号分隔）</label>
                <input className="mt-1 w-full rounded-xl border border-line bg-soft p-3 text-sm outline-none focus:border-zinc-400" value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="AI 短视频 副业 自动化" />
              </div>
              <div>
                <label className="text-xs text-muted">隐私设置</label>
                <select className="mt-1 w-full rounded-xl border border-line bg-soft p-3 text-sm" value={privacy} onChange={e => setPrivacy(e.target.value as "public" | "private" | "unlisted")}>
                  <option value="public">公开</option>
                  <option value="unlisted">不公开列出</option>
                  <option value="private">仅自己可见</option>
                </select>
              </div>
            </div>

            {error && <p className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

            {success && (
              <div className="mb-3 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-300">
                发布成功！{success.url && <a href={success.url} target="_blank" rel="noopener noreferrer" className="ml-2 underline">查看视频 →</a>}
              </div>
            )}

            <button
              onClick={publish}
              disabled={publishing || !selectedAccountId}
              className="w-full rounded-2xl bg-white py-3 font-semibold text-black disabled:opacity-50"
            >
              {publishing ? "发布中..." : "立即发布"}
            </button>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-muted text-sm mb-4">还没有连接任何社媒账号</p>
            <p className="text-xs text-muted">点击上方平台旁的"连接 →"按钮授权</p>
          </div>
        )}

        {/* 历史发布记录 */}
        {records.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs text-muted mb-3">发布历史</p>
            <div className="space-y-2">
              {records.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted">{PLATFORM_META[r.platform]?.icon} {r.socialAccount.platformUsername || r.platform}</span>
                  <span className={r.status === "published" ? "text-green-400" : r.status === "failed" ? "text-red-400" : "text-yellow-400"}>
                    {r.status === "published" ? "已发布" : r.status === "failed" ? "失败" : "处理中"}
                  </span>
                  {r.platformPostUrl && (
                    <a href={r.platformPostUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">查看</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
