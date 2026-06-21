import { Queue } from "bullmq";
import { db } from "../db";
import { getQueueRedisConnection } from "./redis";

export const PROJECT_WORKFLOW_QUEUE_NAME = "onevideo.project-workflow";
export const PROJECT_WORKFLOW_JOB_NAME = "generate-project";

export type ProjectWorkflowJobData = {
  projectId: string;
  requestedBy?: "create" | "retry" | "seed";
};

const globalForProjectQueue = globalThis as unknown as {
  projectWorkflowQueue?: Queue;
};

export function getProjectWorkflowQueue() {
  if (!globalForProjectQueue.projectWorkflowQueue) {
    globalForProjectQueue.projectWorkflowQueue = new Queue(
      PROJECT_WORKFLOW_QUEUE_NAME,
      {
        connection: getQueueRedisConnection(),
        defaultJobOptions: {
          attempts: Number(process.env.PROJECT_WORKFLOW_ATTEMPTS || 2),
          backoff: {
            type: "exponential",
            delay: Number(process.env.PROJECT_WORKFLOW_BACKOFF_MS || 5000)
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
      }
    );
  }

  return globalForProjectQueue.projectWorkflowQueue;
}

export async function enqueueProjectWorkflow(
  projectId: string,
  requestedBy: ProjectWorkflowJobData["requestedBy"] = "create"
) {
  const queue = getProjectWorkflowQueue();
  const job = await queue.add(
    PROJECT_WORKFLOW_JOB_NAME,
    {
      projectId,
      requestedBy
    } satisfies ProjectWorkflowJobData,
    {
      jobId: `project:${projectId}:${Date.now()}`
    }
  );

  await db.project.update({
    where: {
      id: projectId
    },
    data: {
      status: "queued",
      progress: 1,
      workflowJobId: String(job.id),
      queuedAt: new Date(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorMessage: null
    }
  });

  return job;
}
