import { Nav } from "@/components/nav";
import { ProjectStatusView } from "@/components/project-status-view";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function ProjectDetailPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      scenes: { orderBy: { sceneIndex: "asc" } },
      assets: true,
      modelTasks: true
    }
  });

  if (!project) notFound();

  const initialProject = JSON.parse(JSON.stringify(project));

  return (
    <>
      <Nav />
      <ProjectStatusView initialProject={initialProject} />
    </>
  );
}
