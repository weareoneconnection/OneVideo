import Link from "next/link";
import { StatusPill } from "./status-pill";

export function ProjectCard({ project }: { project: any }) {
  return (
    <Link href={`/dashboard/projects/${project.id}`} className="block rounded-2xl border border-line bg-panel p-5 transition hover:border-zinc-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{project.title || "Untitled Video"}</h3>
          <p className="mt-2 line-clamp-2 text-sm text-muted">{project.topic}</p>
        </div>
        <StatusPill status={project.status} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-xs text-muted">
        <div className="rounded-xl bg-soft p-3">{project.platform}</div>
        <div className="rounded-xl bg-soft p-3">{project.durationSeconds}s</div>
        <div className="rounded-xl bg-soft p-3">{project.aspectRatio}</div>
      </div>
    </Link>
  );
}
