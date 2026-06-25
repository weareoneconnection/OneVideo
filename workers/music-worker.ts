import { Worker } from "bullmq";
import { db } from "../lib/db";
import { getQueueRedisConnection } from "../lib/queues/redis";
import {
  MUSIC_POLL_QUEUE_NAME,
  MUSIC_POLL_JOB_NAME,
  type MusicPollJobData
} from "../lib/queues/music-queue";

const musicWorker = new Worker<MusicPollJobData>(
  MUSIC_POLL_QUEUE_NAME,
  async (job) => {
    const { projectId, jobId, provider } = job.data;

    console.log("Music poll job started", { jobId: job.id, projectId, provider, musicJobId: jobId });

    if (provider === "suno") {
      const { pollSunoMusic } = await import("../lib/providers/suno");
      const result = await pollSunoMusic(jobId);

      if (result.status === "completed" && result.audioUrl) {
        await db.project.update({
          where: { id: projectId },
          data: { backgroundMusicUrl: result.audioUrl }
        });
        console.log("Suno music completed:", { projectId, audioUrl: result.audioUrl });
        return { projectId, audioUrl: result.audioUrl };
      }

      if (result.status === "failed") {
        await db.project.update({
          where: { id: projectId },
          data: { musicProvider: "failed" }
        });
        console.warn("Suno music failed:", { projectId, jobId });
        return { projectId, status: "failed" };
      }

      // still pending — throw to trigger BullMQ retry (uses backoff)
      throw new Error(`Suno music still processing: ${jobId}`);
    }

    console.warn("Unknown music provider:", provider);
    return { projectId, status: "unknown" };
  },
  {
    connection: getQueueRedisConnection(),
    concurrency: 2
  }
);

musicWorker.on("completed", (job) => {
  console.log("Music poll job completed", { jobId: job.id });
});

musicWorker.on("failed", (job, err) => {
  // Only log actual failures (not retry-pending)
  if (job && !err.message.includes("still processing")) {
    console.error("Music poll job failed", { jobId: job?.id, err: err.message });
  }
});

export { musicWorker };
export { MUSIC_POLL_QUEUE_NAME };
