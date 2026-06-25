import { db } from "@/lib/db";
import { getWorkerHealth } from "@/lib/worker-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "partial_failed",
  "completed_clips",
  "needs_review"
]);

const POLL_INTERVAL_MS = 3000;

export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = async () => {
        if (closed) return;
        try {
          const project = await db.project.findUnique({
            where: { id: projectId },
            include: {
              scenes: { orderBy: { sceneIndex: "asc" } },
              assets: true,
              modelTasks: true
            }
          });

          if (!project) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Project not found" })}\n\n`));
            closed = true;
            controller.close();
            return;
          }

          const payload = JSON.stringify({
            project,
            workerHealth: await getWorkerHealth()
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));

          if (TERMINAL_STATUSES.has(project.status)) {
            closed = true;
            controller.close();
          }
        } catch {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      };

      await send();

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        await send();
        if (closed) clearInterval(interval);
      }, POLL_INTERVAL_MS);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
