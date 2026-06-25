import { Nav } from "@/components/nav";
import { getOrCreateUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS, CREDIT_PACKS } from "@/lib/stripe";
import { BillingActions } from "@/components/billing-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getOrCreateUser();

  const credits = await db.creditAccount.findUnique({ where: { userId: user.id } });
  const balance = credits?.balance ?? 0;

  const planId = (user.stripePlanId as keyof typeof PLANS) || "free";
  const plan = PLANS[planId] || PLANS.free;

  const ledger = await db.creditLedger.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="text-3xl font-bold mb-8">计费 & 积分</h1>

        {/* 当前套餐 */}
        <div className="mb-6 rounded-3xl border border-line bg-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1">当前套餐</div>
              <div className="text-2xl font-bold">{plan.label}</div>
              <div className="text-muted text-sm mt-1">{plan.price} · 每月 {plan.credits} 积分</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted mb-1">积分余额</div>
              <div className="text-3xl font-bold">{balance.toLocaleString()}</div>
              {plan.credits > 0 && (
                <div className="mt-2 h-2 w-32 rounded-full bg-soft overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{ width: `${Math.min(100, (balance / plan.credits) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
          {user.planExpiresAt && (
            <div className="text-xs text-muted">
              下次续费：{new Date(user.planExpiresAt).toLocaleDateString("zh-CN")}
            </div>
          )}
        </div>

        <BillingActions
          currentPlanId={planId}
          hasStripeAccount={!!user.stripeCustomerId}
          plans={PLANS}
          creditPacks={CREDIT_PACKS}
        />

        {/* 积分记录 */}
        {ledger.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4">积分记录</h2>
            <div className="rounded-2xl border border-line overflow-hidden">
              {ledger.map((entry, i) => (
                <div key={entry.id} className={`flex items-center justify-between px-5 py-3 text-sm ${i > 0 ? "border-t border-line" : ""}`}>
                  <div>
                    <div className="font-medium">{entry.description || entry.type}</div>
                    <div className="text-xs text-muted mt-0.5">{new Date(entry.createdAt).toLocaleString("zh-CN")}</div>
                  </div>
                  <div className={entry.amount > 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                    {entry.amount > 0 ? "+" : ""}{entry.amount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
