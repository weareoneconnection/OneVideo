"use client";
import { useState } from "react";

export function AnalyticsSyncButton({ projectId }: { projectId?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setResult(null);
    const url = "/api/analytics/sync" + (projectId ? `?projectId=${projectId}` : "");
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    setResult(`同步完成：${data.synced}/${data.total} 条`);
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-muted">{result}</span>}
      <button
        onClick={sync}
        disabled={loading}
        className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:border-white/40 disabled:opacity-50"
      >
        {loading ? "同步中..." : "↻ 同步播放数据"}
      </button>
    </div>
  );
}
