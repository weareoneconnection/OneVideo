import { Nav } from "@/components/nav";
import { db } from "@/lib/db";
import { getOrCreateUser } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  created: "待开始", queued: "队列中", generating_script: "生成脚本",
  generating_storyboard: "生成分镜", generating_video: "生成视频",
  rendering: "渲染中", completed: "已完成", failed: "失败", partial_failed: "部分失败"
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "border-green-500/40 bg-green-500/10 text-green-400",
    failed: "border-red-500/40 bg-red-500/10 text-red-400",
    partial_failed: "border-orange-500/40 bg-orange-500/10 text-orange-400"
  };
  const cls = colors[status] || "border-line bg-soft text-muted";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default async function BatchPage({
  params
}: {
  params: Promise<{ batchId: string }>;
}) {
  const user = await getOrCreateUser();
  const { batchId } = await params;

  const batch = await db.projectBatch.findUnique({
    where: { id: batchId },
    include: {
      projects: {
        include: { scenes: { orderBy: { sceneIndex: "asc" } } },
        orderBy: { variantIndex: "asc" }
      }
    }
  });

  if (!batch || batch.userId !== user.id) notFound();

  const completed = batch.projects.filter(p => p.status === "completed").length;
  const total = batch.projects.length;
  const dimensionLabel: Record<string, string> = { style: "风格", hook: "Hook", duration: "时长" };

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-12">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link href="/dashboard/projects" className="text-sm text-muted hover:text-white">← 所有项目</Link>
            </div>
            <h1 className="text-3xl font-bold">A/B 批量测试</h1>
            <p className="mt-2 text-muted text-sm max-w-xl">{batch.topic}</p>
            <div className="mt-3 flex items-center gap-3 text-sm text-muted">
              <span>测试维度：{dimensionLabel[batch.variantDimension] || batch.variantDimension}</span>
              <span>·</span>
              <span>{completed}/{total} 完成</span>
              <span>·</span>
              <StatusBadge status={batch.status} />
            </div>
          </div>
          {batch.status === "running" && (
            <div className="text-xs text-muted mt-8">自动刷新中 <span className="animate-pulse">●</span></div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-6 h-1.5 w-full rounded-full bg-soft overflow-hidden">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>

        {/* Winner banner */}
        {batch.winnerProjectId && (
          <div className="mt-6 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">⭐</span>
            <div>
              <div className="font-semibold text-yellow-300">AI 推荐最优版本</div>
              <div className="text-sm text-muted mt-0.5">
                {batch.projects.find(p => p.id === batch.winnerProjectId)?.variantLabel || "Winner"}
                {" "}·{" "}
                <Link href={`/dashboard/projects/${batch.winnerProjectId}`} className="text-yellow-300 hover:underline">
                  查看项目 →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Variant cards */}
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {batch.projects.map((project) => {
            const isWinner = project.id === batch.winnerProjectId;
            const completedScenes = project.scenes.filter(s => s.status === "completed").length;

            return (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className={`block rounded-2xl border p-5 hover:border-white/30 transition-all ${isWinner ? "border-yellow-500/50 bg-yellow-500/5" : "border-line bg-panel"}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    {isWinner && <div className="text-xs text-yellow-400 font-bold mb-1">⭐ AI 推荐</div>}
                    <div className="font-semibold text-sm">{project.variantLabel || `变体 ${project.variantIndex}`}</div>
                    {project.selectedHook && (
                      <div className="mt-1 text-xs text-muted line-clamp-2">Hook: {project.selectedHook}</div>
                    )}
                  </div>
                  <StatusBadge status={project.status} />
                </div>

                {/* Progress */}
                {project.status !== "completed" && project.status !== "failed" && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span>{project.scenes.length > 0 ? `${completedScenes}/${project.scenes.length} 场景` : "准备中"}</span>
                      <span>{project.progress ?? 0}%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-soft overflow-hidden">
                      <div className="h-full rounded-full bg-white" style={{ width: `${project.progress ?? 0}%` }} />
                    </div>
                  </div>
                )}

                {/* Video preview */}
                {project.finalVideoUrl && (
                  <video
                    src={project.finalVideoUrl}
                    className="mt-2 w-full rounded-xl aspect-[9/16] object-cover bg-black"
                    controls
                    muted
                    playsInline
                    preload="metadata"
                  />
                )}

                {/* AI Score */}
                {project.aiScore !== null && project.aiScore !== undefined && (
                  <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 ${isWinner ? "border-yellow-500/30 bg-yellow-500/10" : "border-line bg-soft"}`}>
                    <span className="text-xs text-muted">AI 评分</span>
                    <div className="flex-1 h-1.5 rounded-full bg-black/30 overflow-hidden">
                      <div className="h-full rounded-full bg-white" style={{ width: `${project.aiScore}%` }} />
                    </div>
                    <span className={`text-sm font-bold ${isWinner ? "text-yellow-300" : ""}`}>{project.aiScore}</span>
                  </div>
                )}

                <div className="mt-3 text-xs text-muted">
                  {project.style?.slice(0, 60)}{project.style && project.style.length > 60 ? "..." : ""}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Auto-refresh for running batch */}
        {batch.status === "running" && (
          <script dangerouslySetInnerHTML={{ __html: `setTimeout(()=>location.reload(), 8000)` }} />
        )}
      </main>
    </>
  );
}
