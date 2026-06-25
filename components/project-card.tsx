import Link from "next/link";
import { StatusPill } from "./status-pill";

export function ProjectCard({ project }: { project: any }) {
  const isWinner = project.isWinner;
  const hasBatch = !!project.batchId;

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className={`block rounded-2xl border p-5 transition hover:border-zinc-500 ${isWinner ? "border-yellow-500/50 bg-yellow-500/5" : "border-line bg-panel"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {isWinner && <div className="text-xs text-yellow-400 font-bold mb-1">⭐ AI 推荐最优</div>}
          {hasBatch && project.variantLabel && (
            <div className="text-xs text-muted mb-1">
              <Link href={`/dashboard/projects/batch/${project.batchId}`} className="hover:text-white" onClick={e => e.stopPropagation()}>
                A/B · {project.variantLabel}
              </Link>
            </div>
          )}
          <h3 className="text-lg font-semibold leading-snug">{project.title || "Untitled Video"}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{project.topic}</p>
        </div>
        <StatusPill status={project.status} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-muted">
        <div className="rounded-xl bg-soft p-3">{project.platform}</div>
        <div className="rounded-xl bg-soft p-3">{project.durationSeconds}s</div>
        <div className="rounded-xl bg-soft p-3">{project.aspectRatio}</div>
      </div>
      {project.aiScore !== null && project.aiScore !== undefined && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted">AI 评分</span>
          <div className="flex-1 h-1 rounded-full bg-soft overflow-hidden">
            <div className="h-full rounded-full bg-white" style={{ width: `${project.aiScore}%` }} />
          </div>
          <span className="text-xs font-bold">{project.aiScore}</span>
        </div>
      )}
    </Link>
  );
}
