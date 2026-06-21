import type { Project, Scene } from "@prisma/client";
import { Nav } from "@/components/nav";
import { ProjectCard } from "@/components/project-card";
import { db } from "@/lib/db";
import { ensureDemoUser } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectWithScenes = Project & {
  scenes: Scene[];
};

export default async function ProjectsPage() {
  const user = await ensureDemoUser();
  const projects = await db.project.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { scenes: true } });

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold">Projects</h1>
            <p className="mt-3 text-muted">Your AI video production pipeline.</p>
          </div>
          <a href="/create" className="rounded-2xl bg-white px-5 py-3 font-semibold text-black">New Video</a>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project: ProjectWithScenes) => <ProjectCard key={project.id} project={project} />)}
        </div>
        {projects.length === 0 && <p className="mt-12 rounded-2xl border border-line bg-panel p-8 text-muted">No projects yet. Create your first AI video.</p>}
      </main>
    </>
  );
}