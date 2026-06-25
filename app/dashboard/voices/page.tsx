"use client";

import { useState, useEffect, useRef } from "react";
import { Nav } from "@/components/nav";

type VoiceProfile = {
  id: string;
  name: string;
  language: string;
  isDefault: boolean;
  createdAt: string;
};

export default function VoicesPage() {
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");

  async function loadVoices() {
    const res = await fetch("/api/voices");
    const data = await res.json();
    setVoices(data.voices || []);
  }

  useEffect(() => { void loadVoices(); }, []);

  async function deleteVoice(id: string) {
    if (!confirm("确认删除此声音？")) return;
    await fetch(`/api/voices/${id}`, { method: "DELETE" });
    void loadVoices();
  }

  async function setDefault(id: string) {
    await fetch(`/api/voices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true })
    });
    void loadVoices();
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">声音克隆</h1>
            <p className="mt-1 text-muted text-sm">上传样本，创建专属 AI 配音声音</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-2xl bg-white px-5 py-3 font-semibold text-black text-sm"
          >
            + 上传新声音
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {voices.length === 0 ? (
          <div className="rounded-3xl border border-line bg-panel p-12 text-center">
            <div className="text-4xl mb-4">🎙</div>
            <p className="text-muted">还没有声音克隆</p>
            <p className="text-muted text-sm mt-1">上传 30s 以上的音频样本即可克隆你的声音</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {voices.map((v) => (
              <div key={v.id} className="flex items-center gap-4 rounded-2xl border border-line bg-panel px-5 py-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{v.name}</span>
                    {v.isDefault && (
                      <span className="rounded-full bg-green-900/40 px-2 py-0.5 text-xs text-green-400">默认</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {v.language === "zh" ? "中文" : "English"} · 创建于 {new Date(v.createdAt).toLocaleDateString("zh-CN")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!v.isDefault && (
                    <button
                      onClick={() => setDefault(v.id)}
                      className="rounded-xl border border-line px-3 py-1.5 text-xs font-medium hover:border-white/40"
                    >
                      设为默认
                    </button>
                  )}
                  <button
                    onClick={() => deleteVoice(v.id)}
                    className="rounded-xl border border-red-900 px-3 py-1.5 text-xs font-medium text-red-400 hover:border-red-600"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <UploadVoiceModal
            onClose={() => setShowModal(false)}
            onSuccess={() => { setShowModal(false); void loadVoices(); }}
            onError={setError}
          />
        )}
      </main>
    </>
  );
}

function UploadVoiceModal({
  onClose,
  onSuccess,
  onError
}: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (e: string) => void;
}) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("zh");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!file || !name.trim()) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name.trim());
    fd.append("language", language);

    const res = await fetch("/api/voices", { method: "POST", body: fd });
    setUploading(false);

    if (res.ok) {
      onSuccess();
    } else {
      const data = await res.json().catch(() => ({}));
      onError(data.error || "上传失败");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-8">
        <h2 className="text-xl font-bold mb-6">上传声音样本</h2>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium">声音名称</label>
          <input
            className="w-full rounded-xl border border-line bg-soft px-4 py-2.5 text-sm outline-none focus:border-white/40"
            placeholder="例：品牌主播声音"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium">语言</label>
          <select
            className="w-full rounded-xl border border-line bg-soft px-4 py-2.5 text-sm outline-none"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium">音频文件（mp3 / wav / m4a，建议 30s+）</label>
          <div
            className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-soft px-4 py-8 text-sm text-muted hover:border-white/30"
            onClick={() => inputRef.current?.click()}
          >
            {file ? (
              <span className="text-white">{file.name}</span>
            ) : (
              <span>点击选择文件</span>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,audio/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-line py-3 text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={uploading || !file || !name.trim()}
            className="flex-1 rounded-2xl bg-white py-3 text-sm font-semibold text-black disabled:opacity-50"
          >
            {uploading ? "上传中..." : "上传并克隆"}
          </button>
        </div>
      </div>
    </div>
  );
}
