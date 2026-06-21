import { db } from "./db";

export type WorkerHealth = {
  online: boolean;
  staleAfterSeconds: number;
  workers: Array<{
    name: string;
    queueName: string;
    status: string;
    lastSeenAt: Date;
    isStale: boolean;
  }>;
};

export async function getWorkerHealth(): Promise<WorkerHealth> {
  const staleAfterSeconds = Number(process.env.WORKER_STALE_AFTER_SECONDS || 30);
  const cutoff = Date.now() - staleAfterSeconds * 1000;
  const heartbeats = await db.workerHeartbeat.findMany({
    orderBy: {
      lastSeenAt: "desc"
    },
    take: 20
  });

  const workers = heartbeats.map((heartbeat) => ({
    name: heartbeat.name,
    queueName: heartbeat.queueName,
    status: heartbeat.status,
    lastSeenAt: heartbeat.lastSeenAt,
    isStale: heartbeat.lastSeenAt.getTime() < cutoff
  }));

  return {
    online: workers.some((worker) => !worker.isStale),
    staleAfterSeconds,
    workers
  };
}
