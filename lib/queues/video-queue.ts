import { Queue } from "bullmq";
import { db } from "../db";
import { getQueueRedisConnection } from "./redis";

export const SCENE_VIDEO_QUEUE_NAME = "onevideo.scene-video";
export const SCENE_VIDEO_JOB_NAME = "generate-scene-video";
export const SCENE_VIDEO_POLL_JOB_NAME = "poll-scene-video";
export const RENDER_QUEUE_NAME = "onevideo.render";
export const RENDER_JOB_NAME = "render-project";

export type SceneVideoJobData = {
  projectId: string;
  sceneId: string;
  requestedBy?: "workflow" | "retry" | "poll";
  phase?: "generate" | "poll";
  externalTaskId?: string;
  provider?: string;
  model?: string;
  generationType?: "text_to_video" | "image_to_video";
  pollAttempt?: number;
};

export type RenderJobData = {
  projectId: string;
  requestedBy?: "scene-complete" | "retry";
};

const globalForVideoQueues = globalThis as unknown as {
  sceneVideoQueue?: Queue;
  renderQueue?: Queue;
};

export function getSceneVideoQueue() {
  if (!globalForVideoQueues.sceneVideoQueue) {
    globalForVideoQueues.sceneVideoQueue = new Queue(SCENE_VIDEO_QUEUE_NAME, {
      connection: getQueueRedisConnection(),
      defaultJobOptions: {
        attempts: Number(process.env.SCENE_VIDEO_ATTEMPTS || 1),
        backoff: {
          type: "exponential",
          delay: Number(process.env.SCENE_VIDEO_BACKOFF_MS || 10000)
        },
        removeOnComplete: {
          age: 60 * 60 * 24,
          count: 200
        },
        removeOnFail: {
          age: 60 * 60 * 24 * 7,
          count: 1000
        }
      }
    });
  }

  return globalForVideoQueues.sceneVideoQueue;
}

export function getRenderQueue() {
  if (!globalForVideoQueues.renderQueue) {
    globalForVideoQueues.renderQueue = new Queue(RENDER_QUEUE_NAME, {
      connection: getQueueRedisConnection(),
      defaultJobOptions: {
        attempts: Number(process.env.RENDER_ATTEMPTS || 1),
        backoff: {
          type: "exponential",
          delay: Number(process.env.RENDER_BACKOFF_MS || 10000)
        },
        removeOnComplete: {
          age: 60 * 60 * 24,
          count: 100
        },
        removeOnFail: {
          age: 60 * 60 * 24 * 7,
          count: 500
        }
      }
    });
  }

  return globalForVideoQueues.renderQueue;
}

export async function enqueueSceneVideo(
  sceneId: string,
  requestedBy: SceneVideoJobData["requestedBy"] = "workflow"
) {
  const scene = await db.scene.findUniqueOrThrow({
    where: {
      id: sceneId
    },
    select: {
      id: true,
      projectId: true
    }
  });

  const queue = getSceneVideoQueue();
  const job = await queue.add(
    SCENE_VIDEO_JOB_NAME,
    {
      projectId: scene.projectId,
      sceneId: scene.id,
      requestedBy,
      phase: "generate"
    } satisfies SceneVideoJobData,
    {
      jobId: `scene:${scene.id}:${Date.now()}`
    }
  );

  await db.scene.update({
    where: {
      id: scene.id
    },
    data: {
      status: "queued",
      videoJobId: String(job.id),
      videoUrl: null,
      provider: null,
      model: null,
      externalTaskId: null,
      rawStatus: null,
      qualityScore: null,
      reviewStatus: "pending",
      qualityNotes: null,
      queuedAt: new Date(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorMessage: null
    }
  });

  return job;
}

export async function enqueueSceneVideoPoll(input: {
  projectId: string;
  sceneId: string;
  externalTaskId: string;
  provider: string;
  model: string;
  generationType: "text_to_video" | "image_to_video";
  pollAttempt?: number;
  delayMs?: number;
}) {
  const pollAttempt = input.pollAttempt || 1;
  const queue = getSceneVideoQueue();
  const job = await queue.add(
    SCENE_VIDEO_POLL_JOB_NAME,
    {
      projectId: input.projectId,
      sceneId: input.sceneId,
      requestedBy: "poll",
      phase: "poll",
      externalTaskId: input.externalTaskId,
      provider: input.provider,
      model: input.model,
      generationType: input.generationType,
      pollAttempt
    } satisfies SceneVideoJobData,
    {
      jobId: `scene-poll:${input.sceneId}:${input.externalTaskId}:${pollAttempt}`,
      delay: input.delayMs || Number(process.env.PROVIDER_POLL_INTERVAL_MS || 10000)
    }
  );

  await db.scene.update({
    where: {
      id: input.sceneId
    },
    data: {
      status: "polling_video",
      videoJobId: String(job.id),
      provider: input.provider,
      model: input.model,
      externalTaskId: input.externalTaskId,
      rawStatus: "queued_for_poll"
    }
  });

  return job;
}

export async function enqueueRenderProject(
  projectId: string,
  requestedBy: RenderJobData["requestedBy"] = "scene-complete"
) {
  const project = await db.project.findUniqueOrThrow({
    where: {
      id: projectId
    },
    select: {
      id: true,
      status: true
    }
  });

  if (project.status === "rendering" || project.status === "completed") {
    return null;
  }

  const queue = getRenderQueue();
  const job = await queue.add(
    RENDER_JOB_NAME,
    {
      projectId,
      requestedBy
    } satisfies RenderJobData,
    {
      jobId: `render:${projectId}:${Date.now()}`
    }
  );

  await db.project.update({
    where: {
      id: projectId
    },
    data: {
      status: "rendering",
      progress: 92,
      renderJobId: String(job.id),
      errorMessage: null
    }
  });

  return job;
}
