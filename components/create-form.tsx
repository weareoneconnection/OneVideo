"use client";

import { useState, useEffect } from "react";

type VoiceProfile = { id: string; name: string; isDefault: boolean };
type HookOption = { id: string; text: string; strategy: string; reasoning: string; estimatedRetention: number };

export function CreateForm() {
  const [topic, setTopic] = useState("我以前是搞工地的，现在用 AI 做了一个自动交易系统，要做一条有反差感的短视频。");
  const [platform, setPlatform] = useState("douyin");
  const [language, setLanguage] = useState("zh");
  const [durationSeconds, setDurationSeconds] = useState(45);
  const [style, setStyle] = useState("真实记录感，科技感，反差感，短视频爆款风格");
  const [voiceProfileId, setVoiceProfileId] = useState("");
  const [voices, setVoices] = useState<VoiceProfile[]>([]);

  // Avatar
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [avatarId, setAvatarId] = useState("");
  // 配乐
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState("");

  // Hook 引擎
  const [hooks, setHooks] = useState<HookOption[]>([]);
  const [selectedHookId, setSelectedHookId] = useState("");
  const [hookLoading, setHookLoading] = useState(false);
  const [hookExpanded, setHookExpanded] = useState<string | null>(null);

  // A/B 批量
  const [batchEnabled, setBatchEnabled] = useState(false);
  const [variantCount, setVariantCount] = useState(3);
  const [variantDimension, setVariantDimension] = useState<"style" | "hook" | "duration">("style");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/voices").then(r => r.json()).then(d => {
      const list: VoiceProfile[] = d.voices || [];
      setVoices(list);
      const def = list.find(v => v.isDefault);
      if (def) setVoiceProfileId(def.id);
    }).catch(() => {});
  }, []);

  async function generateHooks() {
    if (!topic.trim()) { setError("请先填写视频主题"); return; }
    setHookLoading(true);
    setError("");
    setHooks([]);
    setSelectedHookId("");
    try {
      const res = await fetch("/api/hooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, platform, language, style, durationSeconds })
      });
      const data = await res.json();
      setHooks(data.hooks || []);
    } catch {
      setError("Hook 生成失败，请重试");
    } finally {
      setHookLoading(false);
    }
  }

  const selectedHook = hooks.find(h => h.id === selectedHookId);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      if (batchEnabled) {
        const res = await fetch("/api/projects/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic, platform, language, durationSeconds, aspectRatio: "9:16",
            baseStyle: style,
            variantCount,
            variantDimension,
            voiceProfileId: voiceProfileId || undefined
          })
        });
        const data = await res.json();
        if (data.batchId) {
          window.location.href = `/dashboard/projects/batch/${data.batchId}`;
          return;
        }
        setError(data.error || "批量生成失败");
      } else {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic, platform, language, durationSeconds, aspectRatio: "9:16", style,
            voiceProfileId: voiceProfileId || undefined,
            avatarEnabled,
            avatarId: avatarEnabled ? avatarId : undefined,
            musicEnabled,
            musicPrompt: musicEnabled && musicPrompt ? musicPrompt : undefined,
            selectedHook: selectedHook?.text,
            hookStrategy: selectedHook?.strategy,
            hookOptions: hooks.length > 0 ? hooks : undefined
          })
        });
        const data = await res.json();
        if (data.projectId) {
          window.location.href = `/dashboard/projects/${data.projectId}`;
          return;
        }
        setError(data.error || "Project could not be created.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  const strategyColor: Record<string, string> = {
    "好奇缺口": "violet", "Curiosity Gap": "violet",
    "反差对比": "orange", "Contrast": "orange",
    "痛点共鸣": "emerald", "Pain Point": "emerald",
    "社会证明": "sky", "Social Proof": "sky"
  };
  function getBadgeClass(strategy: string) {
    const c = strategyColor[strategy] || "zinc";
    return `border border-${c}-500/40 bg-${c}-500/10 text-${c}-400`;
  }

  return (
    <div className="rounded-3xl border border-line bg-panel p-6">
      <label className="text-sm font-medium">视频主题 / 产品 / 故事</label>
      <textarea className="mt-3 h-36 w-full rounded-2xl border border-line bg-soft p-4 outline-none focus:border-zinc-400 text-sm" value={topic} onChange={(e) => setTopic(e.target.value)} />

      {/* 基础设置 */}
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-sm text-muted">平台</label>
          <select className="mt-2 w-full rounded-xl border border-line bg-soft p-3 text-sm" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="douyin">抖音</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube_shorts">YouTube Shorts</option>
            <option value="xiaohongshu">小红书</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-muted">语言</label>
          <select className="mt-2 w-full rounded-xl border border-line bg-soft p-3 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-muted">时长</label>
          <select className="mt-2 w-full rounded-xl border border-line bg-soft p-3 text-sm" value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))}>
            <option value={15}>15 秒</option>
            <option value={30}>30 秒</option>
            <option value={45}>45 秒</option>
            <option value={60}>60 秒</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="text-sm text-muted">视觉风格</label>
        <input className="mt-2 w-full rounded-xl border border-line bg-soft p-3 text-sm" value={style} onChange={(e) => setStyle(e.target.value)} />
      </div>

      {voices.length > 0 && (
        <div className="mt-4">
          <label className="text-sm text-muted">配音声音</label>
          <select className="mt-2 w-full rounded-xl border border-line bg-soft p-3 text-sm" value={voiceProfileId} onChange={(e) => setVoiceProfileId(e.target.value)}>
            <option value="">默认声音（系统 TTS）</option>
            {voices.map(v => <option key={v.id} value={v.id}>{v.name}{v.isDefault ? " ★" : ""}</option>)}
          </select>
        </div>
      )}

      {/* ── 病毒 Hook 引擎 ── */}
      <div className="mt-5 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold">病毒 Hook 引擎</span>
            <span className="ml-2 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">AI 优化留存率</span>
          </div>
          <button
            onClick={generateHooks}
            disabled={hookLoading || !topic.trim()}
            className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50"
          >
            {hookLoading ? "生成中..." : hooks.length > 0 ? "重新生成" : "✨ AI 生成爆款 Hook"}
          </button>
        </div>

        {hooks.length > 0 && (
          <div className="mt-4 space-y-2">
            {hooks.map(h => (
              <div
                key={h.id}
                onClick={() => setSelectedHookId(selectedHookId === h.id ? "" : h.id)}
                className={`cursor-pointer rounded-xl border p-3 transition-all ${selectedHookId === h.id ? "border-violet-400 bg-violet-500/15" : "border-line bg-soft/50 hover:border-violet-500/40"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${getBadgeClass(h.strategy)}`}>{h.strategy}</span>
                      <span className="text-xs text-muted">预估完播率 {h.estimatedRetention}%</span>
                    </div>
                    <p className="text-sm font-medium leading-snug">{h.text}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {selectedHookId === h.id && <span className="text-xs text-violet-400 font-bold">✓ 已选</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); setHookExpanded(hookExpanded === h.id ? null : h.id); }}
                      className="text-xs text-muted hover:text-white"
                    >
                      {hookExpanded === h.id ? "收起" : "原因"}
                    </button>
                  </div>
                </div>
                {hookExpanded === h.id && (
                  <p className="mt-2 text-xs text-muted border-t border-line pt-2">{h.reasoning}</p>
                )}
              </div>
            ))}
            {selectedHookId && (
              <button onClick={() => setSelectedHookId("")} className="text-xs text-muted hover:text-white mt-1">跳过，使用 AI 默认 Hook</button>
            )}
          </div>
        )}
      </div>

      {/* ── A/B 批量生成 ── */}
      <div className="mt-3 rounded-2xl border border-line bg-soft/50 p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={batchEnabled} onChange={(e) => setBatchEnabled(e.target.checked)} className="h-4 w-4 rounded" />
          <span className="text-sm font-medium">A/B 批量生成</span>
          <span className="ml-auto rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">AI 推荐最优版本</span>
        </label>
        {batchEnabled && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted">变体数量</label>
              <select className="mt-1.5 w-full rounded-xl border border-line bg-panel p-2.5 text-sm" value={variantCount} onChange={(e) => setVariantCount(Number(e.target.value))}>
                <option value={2}>2 个变体</option>
                <option value={3}>3 个变体</option>
                <option value={4}>4 个变体</option>
                <option value={5}>5 个变体</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted">测试维度</label>
              <select className="mt-1.5 w-full rounded-xl border border-line bg-panel p-2.5 text-sm" value={variantDimension} onChange={(e) => setVariantDimension(e.target.value as "style" | "hook" | "duration")}>
                <option value="style">风格多样性</option>
                <option value="hook">Hook 测试</option>
                <option value="duration">时长测试</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* AI 数字人 */}
      {!batchEnabled && (
        <>
          <div className="mt-3 rounded-2xl border border-line bg-soft/50 p-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={avatarEnabled} onChange={(e) => setAvatarEnabled(e.target.checked)} className="h-4 w-4 rounded" />
              <span className="text-sm font-medium">AI 数字人主播（HeyGen）</span>
              <span className="ml-auto rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">杀手锏</span>
            </label>
            {avatarEnabled && (
              <div className="mt-3">
                <label className="text-xs text-muted">HeyGen Avatar ID</label>
                <input className="mt-1.5 w-full rounded-xl border border-line bg-panel p-3 text-sm outline-none focus:border-zinc-400" placeholder="例：Kristin_public_3_20240108" value={avatarId} onChange={(e) => setAvatarId(e.target.value)} />
              </div>
            )}
          </div>

          <div className="mt-3 rounded-2xl border border-line bg-soft/50 p-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={musicEnabled} onChange={(e) => setMusicEnabled(e.target.checked)} className="h-4 w-4 rounded" />
              <span className="text-sm font-medium">AI 背景配乐（自动混音）</span>
              <span className="ml-auto rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">高价值</span>
            </label>
            {musicEnabled && (
              <div className="mt-3">
                <label className="text-xs text-muted">音乐描述（可选）</label>
                <input className="mt-1.5 w-full rounded-xl border border-line bg-panel p-3 text-sm outline-none focus:border-zinc-400" placeholder="例：cinematic motivational, no vocals" value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} />
              </div>
            )}
          </div>
        </>
      )}

      <button
        onClick={submit}
        disabled={loading || !topic.trim() || (avatarEnabled && !batchEnabled && !avatarId)}
        className="mt-6 w-full rounded-2xl bg-white px-6 py-4 font-semibold text-black disabled:opacity-60"
      >
        {loading
          ? "创建中..."
          : batchEnabled
          ? `并行生成 ${variantCount} 个变体 → AI 推荐最优`
          : "生成 OneVideo 项目"}
      </button>

      {error && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <p className="mt-3 text-xs text-muted">
        {batchEnabled
          ? `AI 将生成 ${variantCount} 个不同${variantDimension === "style" ? "风格" : variantDimension === "hook" ? "Hook" : "时长"}的变体，并行生产后自动推荐最优版本。`
          : "OneVideo 自动生成连续分镜、场景视频、配音和最终 MP4。"}
      </p>
    </div>
  );
}
