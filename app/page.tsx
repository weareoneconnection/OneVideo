import Link from "next/link";
import { Nav } from "@/components/nav";

export const metadata = {
  title: "OneVideo Studio — AI 短视频生成平台",
  description: "输入一个想法，OneVideo Studio 自动生成脚本、分镜、AI 场景图、配音、字幕，一键发布到 TikTok & YouTube Shorts。"
};

const FEATURES = [
  { icon: "🎣", title: "病毒 Hook 引擎", desc: "AI 分析平台算法，生成 3 个不同策略的爆款 Hook，前 3 秒留住观众。", tag: "完播率 +35%" },
  { icon: "🎬", title: "全自动视频合成", desc: "DALL-E 3 生成场景图，Runway / Kling 驱动动态镜头，自动配音混音。", tag: "3 分钟出片" },
  { icon: "💬", title: "Whisper 智能字幕", desc: "单词级精准时间轴，TikTok 大字幕 / 卡拉 OK 高亮 / 胶囊逐词，直接烧录。", tag: "完播率 +20%" },
  { icon: "🚀", title: "一键发布", desc: "OAuth 连接 TikTok 和 YouTube，视频生成完成后直接发布，无需手动上传。", tag: "节省 30 分钟" },
  { icon: "🧪", title: "A/B 批量测试", desc: "同一主题生成 3–5 个变体，AI 自动评分推荐最优版本，数据说话。", tag: "数据驱动选品" },
  { icon: "📊", title: "播放数据回写", desc: "TikTok / YouTube 播放量、点赞、分享自动同步，定时发布最佳窗口期。", tag: "实时 Analytics" }
];

const STEPS = [
  { num: "01", title: "输入主题", desc: "一句话描述你的产品、故事或想法" },
  { num: "02", title: "选择 Hook", desc: "AI 生成 3 个爆款开场，选最对味的" },
  { num: "03", title: "自动合成", desc: "脚本 → 场景图 → 视频 → 字幕 全自动" },
  { num: "04", title: "一键发布", desc: "直接推送 TikTok & YouTube Shorts" }
];

const STATS = [
  { value: "< 3 min", label: "平均生成时长" },
  { value: "4 种", label: "爆款字幕样式" },
  { value: "A/B × 5", label: "最大变体数量" },
  { value: "2 平台", label: "一键发布渠道" }
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Nav />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-20 pb-24 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
          AI-Native 短视频生产系统 · TikTok + YouTube Shorts
        </div>
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-tight tracking-tight">
          从想法到发布<br />
          <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            全程 AI 自动
          </span>
        </h1>
        <p className="mt-6 mx-auto max-w-2xl text-lg text-muted leading-relaxed">
          输入一句话，OneVideo Studio 自动生成脚本、AI 场景图、配音、字幕，
          A/B 测试最优版本，一键发布。不需要剪辑经验，不需要任何设备。
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/create" className="w-full sm:w-auto rounded-2xl bg-white px-8 py-4 text-base font-semibold text-black hover:bg-white/90 transition-colors">
            免费开始创建
          </Link>
          <Link href="/pricing" className="w-full sm:w-auto rounded-2xl border border-line px-8 py-4 text-base font-semibold hover:border-white/40 transition-colors">
            查看定价 →
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">无需信用卡 · 每月 1000 积分免费</p>

        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {STATS.map(s => (
            <div key={s.label} className="rounded-2xl border border-line bg-panel p-4">
              <div className="text-2xl font-black">{s.value}</div>
              <div className="text-xs text-muted mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-line bg-panel/50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-20">
          <h2 className="text-3xl font-bold text-center mb-14">4 步完成一支爆款短视频</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(step => (
              <div key={step.num} className="rounded-2xl border border-line bg-panel p-6">
                <div className="text-4xl font-black text-muted/20 mb-3">{step.num}</div>
                <div className="font-semibold mb-1">{step.title}</div>
                <div className="text-sm text-muted">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">为爆款而生的每一个功能</h2>
        <p className="text-muted text-center mb-14 max-w-xl mx-auto">
          不是普通的 AI 视频工具。每个模块都针对短视频平台算法和完播率设计。
        </p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-2xl border border-line bg-panel p-6 hover:border-white/30 transition-colors">
              <div className="text-3xl mb-4">{f.icon}</div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold">{f.title}</h3>
                <span className="shrink-0 rounded-full border border-green-900/50 bg-green-950/50 px-2 py-0.5 text-xs text-green-400">{f.tag}</span>
              </div>
              <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-line bg-panel/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 text-center">
          <h2 className="text-4xl font-black mb-4">现在开始，3 分钟出片</h2>
          <p className="text-muted mb-8">无需信用卡。免费额度够你测试整个工作流。</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/create" className="rounded-2xl bg-white px-8 py-4 text-base font-semibold text-black hover:bg-white/90 transition-colors">
              立即免费创建
            </Link>
            <Link href="/dashboard/templates" className="rounded-2xl border border-line px-8 py-4 text-base font-semibold hover:border-white/40 transition-colors">
              浏览模板库
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
          <span className="font-bold text-white">OneVideo Studio</span>
          <div className="flex gap-6">
            <Link href="/pricing" className="hover:text-white transition-colors">定价</Link>
            <Link href="/dashboard/templates" className="hover:text-white transition-colors">模板库</Link>
            <Link href="/create" className="hover:text-white transition-colors">创建视频</Link>
          </div>
          <span>© 2025 OneVideo Studio</span>
        </div>
      </footer>
    </div>
  );
}
