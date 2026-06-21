import { Worker } from "bullmq";
import { db } from "../lib/db";
import { closeQueueRedisConnection, getQueueRedisConnection } from "../lib/queues/redis";
import {
  PROJECT_WORKFLOW_QUEUE_NAME,
  type ProjectWorkflowJobData
} from "../lib/queues/project-queue";
import {
  SCENE_VIDEO_POLL_JOB_NAME,
  RENDER_QUEUE_NAME,
  SCENE_VIDEO_QUEUE_NAME,
  type RenderJobData,
  type SceneVideoJobData
} from "../lib/queues/video-queue";
import { runRenderWorkflow } from "../lib/render";
import {
  runProjectWorkflow,
  runSceneVideoPollWorkflow,
  runSceneVideoWorkflow
} from "../lib/workflow";

const projectConcurrency = Number(process.env.PROJECT_WORKER_CONCURRENCY || 1);
const sceneConcurrency = Number(process.env.SCENE_VIDEO_WORKER_CONCURRENCY || 1);
const renderConcurrency = Number(process.env.RENDER_WORKER_CONCURRENCY || 1);
const workerName = process.env.WORKER_NAME || `onevideo-worker-${Date.now()}`;

async function heartbeat(queueName: string) {
  await db.workerHeartbeat.upsert({
    where: {
      name: `${workerName}:${queueName}`
    },
    update: {
      status: "online",
      queueName,
      lastSeenAt: new Date(),
      metadata: {
        workerName,
        pid: process.pid
      }
    },
    create: {
      name: `${workerName}:${queueName}`,
      queueName,
      status: "online",
      lastSeenAt: new Date(),
      metadata: {
        workerName,
        pid: process.pid
      }
    }
  });
}

async function heartbeatAll() {
  await Promise.all([
    heartbeat(PROJECT_WORKFLOW_QUEUE_NAME),
    heartbeat(SCENE_VIDEO_QUEUE_NAME),
    heartbeat(RENDER_QUEUE_NAME)
  ]);
}

const projectWorker = new Worker<ProjectWorkflowJobData>(
  PROJECT_WORKFLOW_QUEUE_NAME,
  async (job) => {
    const { projectId } = job.data;

    console.log("Project workflow job started", {
      jobId: job.id,
      projectId
    });

    await db.project.update({
      where: {
        id: projectId
      },
      data: {
        workflowJobId: String(job.id),
        startedAt: new Date(),
        failedAt: null,
        errorMessage: null
      }
    });

    const project = await runProjectWorkflow(projectId);

    console.log("Project workflow job completed", {
      jobId: job.id,
      projectId
    });

    return {
      projectId: project.id,
      status: project.status
    };
  },
  {
    connection: getQueueRedisConnection(),
    concurrency: projectConcurrency
  }
);

const sceneWorker = new Worker<SceneVideoJobData>(
  SCENE_VIDEO_QUEUE_NAME,
  async (job) => {
    const { sceneId, projectId } = job.data;

    console.log("Scene video job started", {
      jobId: job.id,
      projectId,
      sceneId
    });

    const scene =
      job.name === SCENE_VIDEO_POLL_JOB_NAME || job.data.phase === "poll"
        ? await runSceneVideoPollWorkflow(job.data)
        : await runSceneVideoWorkflow(sceneId);

    console.log("Scene video job completed", {
      jobId: job.id,
      projectId,
      sceneId
    });

    return {
      projectId,
      sceneId: scene.id,
      status: scene.status
    };
  },
  {
    connection: getQueueRedisConnection(),
    concurrency: sceneConcurrency
  }
);

const renderWorker = new Worker<RenderJobData>(
  RENDER_QUEUE_NAME,
  async (job) => {
    const { projectId } = job.data;

    console.log("Render job started", {
      jobId: job.id,
      projectId
    });

    const project = await runRenderWorkflow(projectId);

    console.log("Render job completed", {
      jobId: job.id,
      projectId
    });

    return {
      projectId,
      status: project?.status || "completed_clips"
    };
  },
  {
    connection: getQueueRedisConnection(),
    concurrency: renderConcurrency
  }
);

projectWorker.on("failed", async (job, error) => {
  const projectId = job?.data.projectId;
  const message = error instanceof Error ? error.message : String(error);

  console.error("Project workflow job failed", {
    jobId: job?.id,
    projectId,
    error: message
  });

  if (!projectId) return;

  await db.project.update({
    where: {
      id: projectId
    },
    data: {
      status: "failed",
      errorMessage: message,
      failedAt: new Date()
    }
  });
});

sceneWorker.on("failed", async (job, error) => {
  const sceneId = job?.data.sceneId;
  const projectId = job?.data.projectId;
  const message = error instanceof Error ? error.message : String(error);

  console.error("Scene video job failed", {
    jobId: job?.id,
    projectId,
    sceneId,
    error: message
  });
});

renderWorker.on("failed", async (job, error) => {
  const projectId = job?.data.projectId;
  const message = error instanceof Error ? error.message : String(error);

  console.error("Render job failed", {
    jobId: job?.id,
    projectId,
    error: message
  });

  if (!projectId) return;

  await db.project.update({
    where: {
      id: projectId
    },
    data: {
      status: "completed_clips",
      progress: 90,
      errorMessage: `Render failed: ${message}`
    }
  });
});

for (const worker of [projectWorker, sceneWorker, renderWorker]) {
  worker.on("error", (error) => {
    console.error("Worker error", error);
  });
}

const heartbeatTimer = setInterval(() => {
  void heartbeatAll().catch((error) => {
    console.error("Worker heartbeat failed", error);
  });
}, Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 10000));

async function shutdown() {
  console.log("Worker shutting down");
  clearInterval(heartbeatTimer);
  await Promise.all([
    projectWorker.close(),
    sceneWorker.close(),
    renderWorker.close()
  ]);
  await closeQueueRedisConnection();
  await db.$disconnect();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

void Promise.all([
  projectWorker.waitUntilReady(),
  sceneWorker.waitUntilReady(),
  renderWorker.waitUntilReady()
])
  .then(async () => {
    await heartbeatAll().catch((error) => {
      console.error("Worker heartbeat failed", error);
    });
    console.log("Workers ready", {
      workerName,
      projectQueue: PROJECT_WORKFLOW_QUEUE_NAME,
      sceneQueue: SCENE_VIDEO_QUEUE_NAME,
      renderQueue: RENDER_QUEUE_NAME,
      projectConcurrency,
      sceneConcurrency,
      renderConcurrency
    });
  })
  .catch((error) => {
    console.error("Worker startup failed", error);
    void shutdown().then(() => process.exit(1));
  });
