"use client";

import { useState } from "react";

export function CreateForm() {
  const [topic, setTopic] = useState("我以前是搞工地的，现在用 AI 做了一个自动交易系统，要做一条有反差感的短视频。");
  const [platform, setPlatform] = useState("douyin");
  const [language, setLanguage] = useState("zh");
  const [durationSeconds, setDurationSeconds] = useState(45);
  const [style, setStyle] = useState("真实记录感，科技感，反差感，短视频爆款风格");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, platform, language, durationSeconds, aspectRatio: "9:16", style })
      });
      const data = await res.json();

      if (data.projectId) {
        window.location.href = `/dashboard/projects/${data.projectId}`;
        return;
      }

      setError(data.error || "Project could not be created.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Project could not be created.");
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

      <button onClick={submit} disabled={loading || !topic.trim()} className="mt-6 w-full rounded-2xl bg-white px-6 py-4 font-semibold text-black disabled:opacity-60">
        {loading ? "Creating generation task..." : "Generate OneVideo Project"}
      </button>
      {error && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <p className="mt-3 text-xs text-muted">
        OneVideo will generate a continuous storyboard, send each scene to the video provider, then render voiceover and final MP4.
      </p>
    </div>
  );
}
