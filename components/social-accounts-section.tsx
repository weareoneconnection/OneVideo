"use client";

import { useState } from "react";

type Account = {
  id: string;
  platform: string;
  platformUserId: string;
  platformUsername: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
};

const PLATFORM_META: Record<string, { label: string; icon: string; color: string; docUrl: string }> = {
  tiktok: {
    label: "TikTok / 抖音",
    icon: "🎵",
    color: "border-pink-500/40 bg-pink-500/5",
    docUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started/"
  },
  youtube: {
    label: "YouTube Shorts",
    icon: "▶",
    color: "border-red-500/40 bg-red-500/5",
    docUrl: "https://developers.google.com/youtube/v3/guides/uploading_a_video"
  }
};

export function SocialAccountsSection({
  initialAccounts,
  tiktokConfigured,
  youtubeConfigured
}: {
  initialAccounts: Account[];
  tiktokConfigured: boolean;
  youtubeConfigured: boolean;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const configured: Record<string, boolean> = { tiktok: tiktokConfigured, youtube: youtubeConfigured };

  async function disconnect(accountId: string) {
    setDisconnecting(accountId);
    await fetch("/api/social/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId })
    });
    setAccounts(prev => prev.filter(a => a.id !== accountId));
    setDisconnecting(null);
  }

  return (
    <div className="rounded-3xl border border-line bg-panel p-6">
      <h2 className="text-xl font-bold mb-1">社媒账号</h2>
      <p className="text-sm text-muted mb-6">连接平台账号后，视频生成完成即可一键发布。</p>

      <div className="space-y-4">
        {Object.entries(PLATFORM_META).map(([key, meta]) => {
          const connectedAccounts = accounts.filter(a => a.platform === key);
          const isConfigured = configured[key];

          return (
            <div key={key} className={`rounded-2xl border p-4 ${meta.color}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{meta.icon}</span>
                  <div>
                    <div className="font-semibold">{meta.label}</div>
                    {!isConfigured && (
                      <div className="text-xs text-yellow-400 mt-0.5">
                        需要配置 API Key —{" "}
                        <a href={meta.docUrl} target="_blank" rel="noopener noreferrer" className="underline">查看文档</a>
                      </div>
                    )}
                  </div>
                </div>
                {isConfigured ? (
                  <a
                    href={`/api/social/connect/${key}`}
                    className="rounded-xl border border-line bg-soft px-4 py-2 text-sm hover:border-zinc-400 transition-colors"
                  >
                    + 连接账号
                  </a>
                ) : (
                  <span className="text-xs text-muted rounded-xl border border-line px-3 py-2">未配置</span>
                )}
              </div>

              {connectedAccounts.length > 0 && (
                <div className="space-y-2">
                  {connectedAccounts.map(acc => {
                    const expired = acc.tokenExpiresAt && new Date(acc.tokenExpiresAt) < new Date();
                    return (
                      <div key={acc.id} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5">
                        <div>
                          <span className="text-sm font-medium">{acc.platformUsername || acc.platformUserId}</span>
                          {expired && <span className="ml-2 text-xs text-red-400">Token 已过期，请重新连接</span>}
                        </div>
                        <button
                          onClick={() => disconnect(acc.id)}
                          disabled={disconnecting === acc.id}
                          className="text-xs text-muted hover:text-red-400 transition-colors"
                        >
                          {disconnecting === acc.id ? "断开中..." : "断开连接"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 配置说明 */}
      <div className="mt-6 rounded-2xl border border-line bg-soft p-4">
        <p className="text-xs font-semibold mb-2">配置说明（.env 环境变量）</p>
        <pre className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{`# TikTok Content Posting API
TIKTOK_CLIENT_KEY=your_client_key
TIKTOK_CLIENT_SECRET=your_client_secret

# YouTube Data API v3
YOUTUBE_CLIENT_ID=your_oauth_client_id
YOUTUBE_CLIENT_SECRET=your_oauth_client_secret`}</pre>
        <p className="text-xs text-muted mt-2">
          Railway 部署时在 Variables 面板添加上述环境变量，重新部署后生效。
        </p>
      </div>
    </div>
  );
}
