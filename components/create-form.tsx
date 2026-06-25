"use client";

import { useState, useEffect } from "react";

type VoiceProfile = { id: string; name: string; isDefault: boolean };

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

  async function submit() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic, platform, language, durationSeconds, aspectRatio: "9:16", style,
          voiceProfileId: voiceProfileId || undefined,
          avatarEnabled,
          avatarId: avatarEnabled ? avatarId : undefined,
          musicEnabled,
          musicPrompt: musicEnabled && musicPrompt ? musicPrompt : undefined
        })
      });
      const data = await res.json();

      if (data.projectId) {
        window.location.href = `/dashboard/projects/${data.projectId}`;
        return;
      }

      setError(data.error || "Project could not be created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project could not be created.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-panel p-6">
      <label className="text-sm font-medium">Video idea / product / story</label>
      <textarea className="mt-3 h-40 w-full rounded-2xl border border-line bg-soft p-4 outline-none focus:border-zinc-400" value={topic} onChange={(e) => setTopic(e.target.value)} />

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-sm text-muted">Platform</label>
          <select className="mt-2 w-full rounded-xl border border-line bg-soft p-3" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="douyin">Douyin</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube_shorts">YouTube Shorts</option>
            <option value="xiaohongshu">Xiaohongshu</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-muted">Language</label>
          <select className="mt-2 w-full rounded-xl border border-line bg-soft p-3" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="zh">Chinese</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-muted">Duration</label>
          <select className="mt-2 w-full rounded-xl border border-line bg-soft p-3" value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))}>
            <option value={15}>15 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds</option>
          </select>
        </div>
      </div>

      <div className="mt-5">
        <label className="text-sm text-muted">Style</label>
        <input className="mt-2 w-full rounded-xl border border-line bg-soft p-3" value={style} onChange={(e) => setStyle(e.target.value)} />
      </div>

      {voices.length > 0 && (
        <div className="mt-5">
          <label className="text-sm text-muted">配音声音</label>
          <select className="mt-2 w-full rounded-xl border border-line bg-soft p-3" value={voiceProfileId} onChange={(e) => setVoiceProfileId(e.target.value)}>
            <option value="">默认声音（系统 TTS）</option>
            {voices.map(v => (
              <option key={v.id} value={v.id}>{v.name}{v.isDefault ? " ★" : ""}</option>
            ))}
          </select>
        </div>
      )}

      {/* AI 数字人 Avatar */}
      <div className="mt-5 rounded-2xl border border-line bg-soft/50 p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={avatarEnabled}
            onChange={(e) => setAvatarEnabled(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm font-medium">AI 数字人主播（HeyGen）</span>
          <span className="ml-auto rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">杀手锏</span>
        </label>
        {avatarEnabled && (
          <div className="mt-3">
            <label className="text-xs text-muted">HeyGen Avatar ID（在 HeyGen 控制台查看）</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-line bg-panel p-3 text-sm outline-none focus:border-zinc-400"
              placeholder="例：Kristin_public_3_20240108"
              value={avatarId}
              onChange={(e) => setAvatarId(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* 背景音乐 */}
      <div className="mt-3 rounded-2xl border border-line bg-soft/50 p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={musicEnabled}
            onChange={(e) => setMusicEnabled(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-sm font-medium">AI 背景配乐（自动混音）</span>
          <span className="ml-auto rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">高价值</span>
        </label>
        {musicEnabled && (
          <div className="mt-3">
            <label className="text-xs text-muted">音乐描述（可选，留空自动生成）</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-line bg-panel p-3 text-sm outline-none focus:border-zinc-400"
              placeholder="例：cinematic motivational, no vocals, upbeat"
              value={musicPrompt}
              onChange={(e) => setMusicPrompt(e.target.value)}
            />
          </div>
        )}
      </div>

      <button onClick={submit} disabled={loading || !topic.trim() || (avatarEnabled && !avatarId)} className="mt-6 w-full rounded-2xl bg-white px-6 py-4 font-semibold text-black disabled:opacity-60">
        {loading ? "Creating generation task..." : "Generate OneVideo Project"}
      </button>
      {error && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <p className="mt-3 text-xs text-muted">
        OneVideo will generate a continuous storyboard, send each scene to the video provider, then render voiceover and final MP4.
      </p>
    </div>
  );
}
