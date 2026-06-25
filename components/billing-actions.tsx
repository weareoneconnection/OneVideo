"use client";

import { useState } from "react";
import type { PLANS, CREDIT_PACKS } from "@/lib/stripe";

type PlanId = "free" | "pro" | "team";

export function BillingActions({
  currentPlanId,
  hasStripeAccount,
  plans,
  creditPacks
}: {
  currentPlanId: PlanId;
  hasStripeAccount: boolean;
  plans: typeof PLANS;
  creditPacks: typeof CREDIT_PACKS;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function checkout(type: "subscription" | "pack", priceId: string | null, label: string) {
    if (!priceId) {
      setError("该套餐尚未配置价格，请联系管理员");
      return;
    }
    setLoading(label);
    setError("");
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, priceId })
    });
    setLoading(null);
    if (res.ok) {
      const data = await res.json();
      window.location.href = data.url;
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "跳转 Stripe 失败");
    }
  }

  async function openPortal() {
    setLoading("portal");
    const res = await fetch("/api/billing/portal", { method: "POST" });
    setLoading(null);
    if (res.ok) {
      const data = await res.json();
      window.location.href = data.url;
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "无法打开订阅管理");
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* 订阅套餐 */}
      <h2 className="text-lg font-semibold mb-4">订阅套餐</h2>
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {(Object.entries(plans) as [PlanId, typeof PLANS[PlanId]][]).map(([id, plan]) => (
          <div
            key={id}
            className={`rounded-2xl border p-5 ${currentPlanId === id ? "border-white/40 bg-white/5" : "border-line bg-panel"}`}
          >
            <div className="font-bold text-lg">{plan.label}</div>
            <div className="text-muted text-sm mt-1">{plan.price}</div>
            <div className="text-xs text-muted mt-1">{plan.credits.toLocaleString()} 积分/月</div>
            {currentPlanId === id ? (
              <div className="mt-4 rounded-xl border border-white/20 py-2 text-center text-sm text-muted">当前套餐</div>
            ) : id === "free" ? (
              <div className="mt-4 rounded-xl border border-line py-2 text-center text-sm text-muted">免费使用</div>
            ) : (
              <button
                onClick={() => checkout("subscription", plan.priceId, plan.label)}
                disabled={loading === plan.label}
                className="mt-4 w-full rounded-xl bg-white py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {loading === plan.label ? "跳转中..." : `升级 ${plan.label}`}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 积分包 */}
      <h2 className="text-lg font-semibold mb-4">积分包（按需购买）</h2>
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        {creditPacks.map((pack) => (
          <div key={pack.label} className="flex items-center justify-between rounded-2xl border border-line bg-panel px-5 py-4">
            <div>
              <div className="font-semibold">{pack.label}</div>
              <div className="text-sm text-muted">{pack.price}</div>
            </div>
            <button
              onClick={() => checkout("pack", pack.priceId, pack.label)}
              disabled={loading === pack.label}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:border-white/40 disabled:opacity-50"
            >
              {loading === pack.label ? "跳转中..." : "购买"}
            </button>
          </div>
        ))}
      </div>

      {/* 管理订阅 */}
      {hasStripeAccount && (
        <button
          onClick={openPortal}
          disabled={loading === "portal"}
          className="rounded-2xl border border-line px-5 py-3 text-sm font-medium hover:border-white/40 disabled:opacity-50"
        >
          {loading === "portal" ? "跳转中..." : "管理订阅 / 付款方式"}
        </button>
      )}
    </div>
  );
}
