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

const POLL_INTERVAL_MS = 5000;

export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      function safeClose() {
        if (closed) return;
        closed = true;
        if (interval) { clearInterval(interval); interval = null; }
        try { controller.close(); } catch { /* already closed by client disconnect */ }
      }

      function safeEnqueue(data: string) {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          safeClose();
          return false;
        }
      }

      const send = async () => {
        if (closed) return;
        try {
          const project = await db.project.findUnique({
            where: { id: projectId },
            include: {
              scenes: {
                orderBy: { sceneIndex: "asc" },
                select: {
                  id: true, sceneIndex: true, status: true, videoUrl: true,
                  imageUrl: true, errorMessage: true, provider: true,
                  durationSeconds: true, voiceover: true, visualPrompt: true,
                  videoPrompt: true, cameraMotion: true, mood: true,
                  entryState: true, exitState: true, continuityAnchor: true,
                  qualityScore: true, reviewStatus: true, qualityNotes: true,
                  costCredits: true, queuedAt: true, startedAt: true,
                  completedAt: true, failedAt: true
                }
              },
              assets: { select: { id: true, type: true, url: true, mimeType: true } },
              modelTasks: {
                select: { id: true, provider: true, taskType: true, status: true, sceneId: true },
                orderBy: { createdAt: "desc" },
                take: 20
              }
            }
          });

          if (!project) {
            safeEnqueue(`data: ${JSON.stringify({ error: "Project not found" })}\n\n`);
            safeClose();
            return;
          }

          const payload = JSON.stringify({
            project,
            workerHealth: await getWorkerHealth()
          });
          safeEnqueue(`data: ${payload}\n\n`);

          if (TERMINAL_STATUSES.has(project.status)) {
            safeClose();
          }
        } catch {
          safeClose();
        }
      };

      await send();

      interval = setInterval(async () => {
        if (closed) { clearInterval(interval!); interval = null; return; }
        await send();
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
