"use client";
import { useState } from "react";
import Link from "next/link";

type Template = {
  id: string; name: string; description: string | null; category: string;
  platform: string; language: string; duration: number; thumbnailUrl: string | null;
  usageCount: number; prompt: string;
};

export function TemplateGrid({ templates, mine }: { templates: Template[]; mine?: boolean }) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function useTemplate(id: string, prompt: string, platform: string, language: string, duration: number) {
    await fetch(`/api/templates/${id}`, { method: "POST" });
    const params = new URLSearchParams({ topic: prompt, platform, language, durationSeconds: String(duration) });
    window.location.href = `/create?${params}`;
  }

  async function deleteTemplate(id: string) {
    if (!confirm("确认删除此模板？")) return;
    setDeleting(id);
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    window.location.reload();
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map(t => (
        <div key={t.id} className="rounded-2xl border border-line bg-panel overflow-hidden flex flex-col">
          {t.thumbnailUrl ? (
            <img src={t.thumbnailUrl} alt={t.name} className="h-36 w-full object-cover" />
          ) : (
            <div className="h-36 bg-soft flex items-center justify-center">
              <span className="text-3xl text-muted">🎬</span>
            </div>
          )}
          <div className="p-4 flex flex-col flex-1">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="font-semibold text-sm leading-tight">{t.name}</div>
              <span className="text-xs text-muted shrink-0">{t.platform}</span>
            </div>
            {t.description && (
              <p className="text-xs text-muted mb-2 line-clamp-2">{t.description}</p>
            )}
            <div className="flex items-center gap-2 mt-auto pt-3 flex-wrap">
              <span className="text-xs text-muted">{t.duration}s · {t.usageCount} 次使用</span>
              <div className="ml-auto flex gap-2">
                {mine && (
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    disabled={deleting === t.id}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-red-400 hover:border-red-900"
                  >
                    删除
                  </button>
                )}
                <button
                  onClick={() => useTemplate(t.id, t.prompt, t.platform, t.language, t.duration)}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90"
                >
                  使用模板
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// "保存为模板" 弹窗按钮（嵌入项目详情页）
export function SaveTemplateButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setLoading(true);
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: desc, isPublic, sourceProjectId: projectId })
    });
    setLoading(false);
    setDone(true);
    setTimeout(() => { setOpen(false); setDone(false); setName(""); setDesc(""); }, 1500);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:border-white/40"
      >
        保存为模板
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-6">
        <h3 className="text-lg font-semibold mb-4">保存为模板</h3>
        {done ? (
          <div className="text-center text-green-400 py-4">✓ 模板已保存</div>
        ) : (
          <>
            <label className="text-xs text-muted">模板名称</label>
            <input
              className="mt-1 mb-3 w-full rounded-xl border border-line bg-soft p-3 text-sm outline-none focus:border-zinc-400"
              placeholder="例：科技产品爆款短视频"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <label className="text-xs text-muted">描述（可选）</label>
            <textarea
              className="mt-1 mb-3 w-full rounded-xl border border-line bg-soft p-3 text-sm outline-none focus:border-zinc-400 resize-none"
              rows={2}
              placeholder="适合什么场景..."
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
            <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm">
              <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="h-4 w-4 rounded" />
              公开分享到模板库
            </label>
            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-line py-2.5 text-sm">取消</button>
              <button
                onClick={save}
                disabled={loading || !name.trim()}
                className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-50"
              >
                {loading ? "保存中..." : "保存"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
