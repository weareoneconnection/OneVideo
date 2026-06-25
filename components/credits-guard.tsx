"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type BalanceData = { balance: number; planCredits: number; planId: string };

export function CreditsGuard({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<BalanceData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/billing/balance")
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  const low = data && data.balance < 50 && !dismissed;

  return (
    <>
      {low && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-yellow-900/40 bg-yellow-950/60 px-5 py-2.5 text-sm backdrop-blur">
          <span className="text-yellow-300">
            积分余额不足（剩余 <strong>{data!.balance}</strong> 分），视频生成可能受阻。
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/dashboard/billing" className="rounded-lg bg-yellow-400 px-3 py-1 text-xs font-bold text-black hover:bg-yellow-300">
              立即充值
            </Link>
            <button onClick={() => setDismissed(true)} className="text-yellow-600 hover:text-yellow-400">✕</button>
          </div>
        </div>
      )}
      {children}
    </>
  );
}

// 小型余额显示徽章（用于 Nav）
export function CreditsDisplay() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/billing/balance")
      .then(r => r.json())
      .then(d => setBalance(d.balance ?? null))
      .catch(() => {});
  }, []);

  if (balance === null) return null;

  return (
    <Link
      href="/dashboard/billing"
      className={`rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
        balance < 50
          ? "border-yellow-900/50 bg-yellow-950/40 text-yellow-400 hover:border-yellow-700"
          : "border-line text-muted hover:border-white/30"
      }`}
    >
      {balance.toLocaleString()} 分
    </Link>
  );
}
