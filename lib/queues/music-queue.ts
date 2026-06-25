import { Queue } from "bullmq";
import { getQueueRedisConnection } from "./redis";

export const MUSIC_POLL_QUEUE_NAME = "onevideo.music-poll";
export const MUSIC_POLL_JOB_NAME = "poll-background-music";

export type MusicPollJobData = {
  projectId: string;
  jobId: string;
  provider: string;
  attempt?: number;
};

const globalForMusicQueue = globalThis as unknown as {
  musicPollQueue?: Queue;
};

export function getMusicPollQueue() {
  if (!globalForMusicQueue.musicPollQueue) {
    globalForMusicQueue.musicPollQueue = new Queue(MUSIC_POLL_QUEUE_NAME, {
      connection: getQueueRedisConnection(),
      defaultJobOptions: {
        attempts: Number(process.env.SUNO_POLL_ATTEMPTS || 24),
        backoff: { type: "fixed", delay: Number(process.env.SUNO_POLL_INTERVAL_MS || 15000) },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 }
      }
    });
  }
  return globalForMusicQueue.musicPollQueue;
}

export async function enqueueMusicPoll(
  projectId: string,
  jobId: string,
  provider: string
) {
  const queue = getMusicPollQueue();
  const safeId = `music-${projectId}-${Date.now()}`;
  await queue.add(
    MUSIC_POLL_JOB_NAME,
    { projectId, jobId, provider } satisfies MusicPollJobData,
    { jobId: safeId }
  );
}
