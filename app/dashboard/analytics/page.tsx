import { Nav } from "@/components/nav";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import { AnalyticsSyncButton } from "@/components/analytics-sync-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getOrCreateUser();

  const records = await db.publishRecord.findMany({
    where: { project: { userId: user.id }, platformPostId: { not: null } },
    include: { project: { select: { id: true, title: true, topic: true, thumbnailUrl: true } } },
    orderBy: { publishedAt: "desc" },
    take: 50
  });

  const totalViews = records.reduce((s, r) => s + (r.viewCount ?? 0), 0);
  const totalLikes = records.reduce((s, r) => s + (r.likeCount ?? 0), 0);
  const totalShares = records.reduce((s, r) => s + (r.shareCount ?? 0), 0);
  const published = records.filter(r => r.status === "published").length;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Analytics</h1>
          <AnalyticsSyncButton />
        </div>

        {/* 汇总指标 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: "发布视频", value: published },
            { label: "总播放量", value: totalViews.toLocaleString() },
            { label: "总点赞数", value: totalLikes.toLocaleString() },
            { label: "总分享数", value: totalShares.toLocaleString() }
          ].map(m => (
            <div key={m.label} className="rounded-2xl border border-line bg-panel p-5">
              <div className="text-xs text-muted mb-1">{m.label}</div>
              <div className="text-2xl font-bold">{m.value}</div>
            </div>
          ))}
        </div>

        {/* 各视频明细 */}
        {records.length === 0 ? (
          <div className="rounded-2xl border border-line bg-panel p-10 text-center text-muted">
            暂无发布记录。发布视频后数据将自动同步。
          </div>
        ) : (
          <div className="space-y-3">
            {records.map(record => (
              <div key={record.id} className="rounded-2xl border border-line bg-panel px-5 py-4">
                <div className="flex items-start gap-4">
                  {record.project.thumbnailUrl && (
                    <img src={record.project.thumbnailUrl} alt="" className="h-14 w-10 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-muted">{record.platform}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${record.status === "published" ? "bg-green-950/50 text-green-400" : "bg-soft text-muted"}`}>
                        {record.status}
                      </span>
                    </div>
                    <div className="font-medium truncate">{record.title || record.project.topic}</div>
                    {record.platformPostUrl && (
                      <a href={record.platformPostUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-white mt-0.5 block truncate">
                        {record.platformPostUrl}
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-right shrink-0">
                    {[
                      ["播放", record.viewCount],
                      ["点赞", record.likeCount],
                      ["评论", record.commentCount],
                      ["分享", record.shareCount]
                    ].map(([label, val]) => (
                      <div key={String(label)}>
                        <div className="text-xs text-muted">{label}</div>
                        <div className="text-sm font-semibold">{val != null ? Number(val).toLocaleString() : "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {record.lastSyncAt && (
                  <div className="mt-2 text-xs text-muted text-right">
                    上次同步：{new Date(record.lastSyncAt).toLocaleString("zh-CN")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
