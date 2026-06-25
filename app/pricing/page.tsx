import Link from "next/link";
import { Nav } from "@/components/nav";
import { PLANS, CREDIT_PACKS } from "@/lib/stripe";

export const metadata = { title: "定价 — OneVideo Studio" };

const PLAN_FEATURES: Record<string, string[]> = {
  free: ["3 个视频/月", "720p 导出", "基础字幕", "社区支持"],
  pro: ["无限视频", "1080p 导出", "Whisper 智能字幕", "TikTok / YouTube 一键发布", "A/B 批量测试", "AI Hook 引擎", "优先客服"],
  team: ["Pro 全部功能", "5000 积分/月", "团队协作（3 席位）", "自定义 AI 数字人", "API 访问", "专属客户成功"]
};

export default function PricingPage() {
  const plans = Object.entries(PLANS) as [string, typeof PLANS[keyof typeof PLANS]][];

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold tracking-tight mb-4">简单定价，按需付费</h1>
          <p className="text-muted text-lg">每月积分自动重置，没用完不进位，用多了买积分包</p>
        </div>

        {/* 套餐卡片 */}
        <div className="grid gap-6 md:grid-cols-3 mb-20">
          {plans.map(([id, plan]) => {
            const isPro = id === "pro";
            const features = PLAN_FEATURES[id] || [];
            return (
              <div
                key={id}
                className={`relative rounded-3xl border p-8 flex flex-col ${
                  isPro ? "border-white/50 bg-white/5" : "border-line bg-panel"
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/30 bg-white px-4 py-1 text-xs font-bold text-black">
                    最受欢迎
                  </div>
                )}
                <div className="mb-6">
                  <div className="text-sm font-bold uppercase tracking-widest text-muted mb-2">{plan.label}</div>
                  <div className="text-4xl font-bold">{plan.price}</div>
                  <div className="text-sm text-muted mt-1">{plan.credits.toLocaleString()} 积分/月</div>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-green-400">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={id === "free" ? "/create" : "/dashboard/billing"}
                  className={`block rounded-2xl py-3 text-center text-sm font-semibold transition-all ${
                    isPro
                      ? "bg-white text-black hover:bg-white/90"
                      : "border border-line hover:border-white/40"
                  }`}
                >
                  {id === "free" ? "免费开始" : `升级 ${plan.label}`}
                </Link>
              </div>
            );
          })}
        </div>

        {/* 积分包 */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold text-center mb-8">积分包 — 按需购买，永不过期</h2>
          <div className="grid gap-4 md:grid-cols-2 max-w-xl mx-auto">
            {CREDIT_PACKS.map(pack => (
              <div key={pack.label} className="flex items-center justify-between rounded-2xl border border-line bg-panel px-6 py-5">
                <div>
                  <div className="font-semibold">{pack.label}</div>
                  <div className="text-sm text-muted mt-0.5">{pack.price} 一次性</div>
                </div>
                <Link
                  href="/dashboard/billing"
                  className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:border-white/40"
                >
                  购买
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* 积分消耗说明 */}
        <div className="rounded-3xl border border-line bg-panel p-8 mb-20">
          <h2 className="text-xl font-bold mb-6 text-center">积分消耗明细</h2>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            {[
              ["生成脚本", "5 积分"],
              ["AI 场景图（每张）", "10 积分"],
              ["视频合成（每段）", "15 积分"],
              ["Whisper 字幕转录", "3 积分"],
              ["AI 配乐生成", "8 积分"],
              ["TikTok / YouTube 发布", "0 积分"],
            ].map(([action, cost]) => (
              <div key={action} className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
                <span className="text-muted">{action}</span>
                <span className="font-semibold">{cost}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">常见问题</h2>
          <div className="space-y-4">
            {[
              ["积分月底没用完会怎样？", "订阅积分每月重置，不累积到下个月。积分包购买的积分永久有效。"],
              ["可以随时取消订阅吗？", "可以，随时取消，当前周期结束前仍可使用 Pro 功能。"],
              ["视频生成失败会扣积分吗？", "失败的任务不扣积分，积分仅在视频成功完成后扣除。"],
              ["支持哪些支付方式？", "支持信用卡、借记卡（Visa、Mastercard、美国运通）。"],
            ].map(([q, a]) => (
              <details key={q} className="group rounded-2xl border border-line bg-panel">
                <summary className="cursor-pointer px-6 py-4 font-medium list-none flex items-center justify-between">
                  {q}
                  <span className="text-muted group-open:rotate-180 transition-transform">↓</span>
                </summary>
                <div className="px-6 pb-4 text-sm text-muted">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
