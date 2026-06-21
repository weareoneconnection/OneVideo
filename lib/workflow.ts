import { db } from "./db";
import { generateScript, generateStoryboard } from "./oneai";
import { demoThumbnailUrl } from "./mock-video";
import {
  createVideoTaskForScene,
  generateVideoForScene,
  pollVideoTaskForScene,
  VideoProviderError,
  type GenerateVideoResult,
  type VideoGenerationType
} from "./video-provider";
import {
  enqueueRenderProject,
  enqueueSceneVideo,
  enqueueSceneVideoPoll,
  type SceneVideoJobData
} from "./queues/video-queue";
import { createDirectorAssets } from "./director-assets";
import { assessSceneVideoQuality, shouldBlockLowQualityScenes } from "./quality";
import { extractSceneQaFrame } from "./video-qa";

type SceneStatusItem = {
  status: string;
};

export async function ensureDemoUser() {
  const email = "demo@onevideo.local";

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Demo Creator",
      credits: {
        create: {
          balance: 1000
        }
      }
    },
    include: {
      credits: true
    }
  });

  return user;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getVideoProgress(completedScenes: number, totalScenes: number) {
  if (totalScenes <= 0) return 45;
  return Math.min(90, 45 + Math.round((completedScenes / totalScenes) * 40));
}

function shouldSplitProviderTask() {
  return process.env.PROVIDER_TASK_SPLIT === "true";
}

function shouldAutoRetryLowQualityScenes() {
  return process.env.VIDEO_QUALITY_AUTO_RETRY === "true";
}

export async function updateProjectVideoAggregate(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: {
      id: projectId
    },
    include: {
      scenes: true
    }
  });

  const totalScenes = project.scenes.length;
  const completedScenes = project.scenes.filter((scene: SceneStatusItem) => scene.status === "completed").length;
  const failedScenes = project.scenes.filter((scene: SceneStatusItem) => scene.status === "failed").length;
  const reviewScenes = project.scenes.filter((scene: SceneStatusItem) => scene.status === "needs_review").length;
  const activeScenes = project.scenes.filter((scene: SceneStatusItem) =>
    ["queued", "generating_video", "polling_video"].includes(scene.status)
  ).length;

  if (totalScenes === 0) return project;

  const progress = getVideoProgress(completedScenes, totalScenes);

  if (failedScenes > 0) {
    return db.project.update({
      where: {
        id: projectId
      },
      data: {
        status: "partial_failed",
        progress,
        errorMessage: `${failedScenes} scene${failedScenes > 1 ? "s" : ""} failed. Retry failed scenes.`
      }
    });
  }

  if (reviewScenes > 0) {
    return db.project.update({
      where: {
        id: projectId
      },
      data: {
        status: "needs_review",
        progress,
        errorMessage: `${reviewScenes} scene${reviewScenes > 1 ? "s" : ""} need review. Retry or approve before rendering.`
      }
    });
  }

  if (completedScenes === totalScenes) {
    await db.project.update({
      where: {
        id: projectId
      },
      data: {
        status: "completed_clips",
        progress: 90,
        errorMessage: null
      }
    });

    await enqueueRenderProject(projectId, "scene-complete");

    return db.project.findUniqueOrThrow({
      where: {
        id: projectId
      }
    });
  }

  return db.project.update({
    where: {
      id: projectId
    },
    data: {
      status: activeScenes > 0 ? "generating_video" : "generating_video",
      progress,
      errorMessage: null
    }
  });
}

export async function runProjectWorkflow(projectId: string) {
  try {
    const project = await db.project.findUniqueOrThrow({
      where: {
        id: projectId
      }
    });

    await db.project.update({
      where: {
        id: projectId
      },
      data: {
        status: "generating_script",
        progress: 5,
        startedAt: new Date(),
        renderedAt: null,
        completedAt: null,
        failedAt: null,
        finalVideoUrl: null,
        errorMessage: null
      }
    });

    const script = await generateScript({
      topic: project.topic,
      platform: project.platform,
      language: project.language,
      durationSeconds: project.durationSeconds,
      aspectRatio: project.aspectRatio,
      style: project.style || undefined
    });

    await db.project.update({
      where: {
        id: projectId
      },
      data: {
        title: script.title,
        scriptJson: script as any,
        visualBibleJson: script.visualBible as any,
        directorNotesJson: {
          version: "v0.5-director-engine",
          mode: "visual-bible-continuity",
          continuityStrategy:
            "Use one project visual bible plus scene entry/exit states, key props and first-frame assets."
        },
        status: "generating_storyboard",
        progress: 25
      }
    });

    const scenes = await generateStoryboard({
      script,
      topic: project.topic,
      durationSeconds: project.durationSeconds,
      aspectRatio: project.aspectRatio,
      language: project.language
    });

    await db.scene.deleteMany({
      where: {
        projectId
      }
    });

    await db.modelTask.deleteMany({
      where: {
        projectId
      }
    });

    await db.asset.deleteMany({
      where: {
        projectId
      }
    });

    await db.project.update({
      where: {
        id: projectId
      },
      data: {
        status: "generating_video",
        progress: 45,
        renderJobId: null
      }
    });

    const createdScenes = [];

    for (const scene of scenes) {
      const createdScene = await db.scene.create({
        data: {
          projectId,
          sceneIndex: scene.sceneIndex,
          durationSeconds: scene.durationSeconds,
          voiceover: scene.voiceover,
          visualPrompt: scene.visualPrompt,
          videoPrompt: scene.videoPrompt,
          cameraMotion: scene.cameraMotion,
          mood: scene.mood,
          location: scene.location || null,
          storyBeat: scene.storyBeat || null,
          entryState: scene.entryState || null,
          exitState: scene.exitState || null,
          continuityNote: scene.continuityNote || null,
          continuityAnchor:
            scene.continuityAnchor ||
            [scene.entryState, scene.exitState].filter(Boolean).join(" → ") ||
            null,
          transitionFromPrevious: scene.transitionFromPrevious || null,
          reviewStatus: "pending",
          status: "pending",
          provider: null,
          model: null,
          videoUrl: null,
          imageUrl: demoThumbnailUrl(),
          costCredits: 15
        }
      });

      createdScenes.push(createdScene);
    }

    await createDirectorAssets({
      projectId,
      topic: project.topic,
      script,
      scenes,
      sceneRecords: createdScenes.map((scene: { id: string; sceneIndex: number }) => ({
        id: scene.id,
        sceneIndex: scene.sceneIndex
      }))
    });

    for (const scene of createdScenes) {
      await enqueueSceneVideo(scene.id, "workflow");
    }

    return db.project.findUniqueOrThrow({
      where: {
        id: projectId
      },
      include: {
        scenes: {
          orderBy: {
            sceneIndex: "asc"
          }
        },
        assets: true,
        modelTasks: true
      }
    });
  } catch (error) {
    const message = getErrorMessage(error);

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

    throw error;
  }
}

async function completeSceneVideo(input: {
  scene: any;
  taskInput: any;
  videoResult: GenerateVideoResult;
  taskStartedAt: Date;
  taskStartedMs: number;
  taskType: VideoGenerationType;
}) {
  const { scene, taskInput, videoResult, taskStartedAt, taskStartedMs, taskType } = input;
  const qaFrame = await extractSceneQaFrame({
    projectId: scene.projectId,
    sceneId: scene.id,
    sceneIndex: scene.sceneIndex,
    videoUrl: videoResult.videoUrl
  });
  const quality = assessSceneVideoQuality({
    provider: videoResult.provider,
    model: videoResult.model,
    videoUrl: videoResult.videoUrl,
    prompt: taskInput.prompt,
    referenceImageUrl: taskInput.referenceImageUrl,
    firstFrameUrl: taskInput.firstFrameUrl,
    qaFrameUrl: qaFrame?.url,
    continuityAnchor: taskInput.continuityAnchor
  });
  const blockForReview =
    quality.reviewStatus === "needs_review" && shouldBlockLowQualityScenes();

  const updatedScene = await db.scene.update({
    where: {
      id: scene.id
    },
    data: {
      status: blockForReview ? "needs_review" : "completed",
      provider: videoResult.provider,
      model: videoResult.model,
      externalTaskId: videoResult.externalTaskId || scene.externalTaskId || null,
      rawStatus: "completed",
      videoUrl: videoResult.videoUrl,
      imageUrl: scene.firstFrameUrl || demoThumbnailUrl(),
      qualityScore: quality.score,
      reviewStatus: quality.reviewStatus,
      qualityNotes: quality.notes,
      completedAt: new Date(),
      failedAt: null,
      errorMessage: blockForReview
        ? "Scene needs review before final render."
        : null
    }
  });

  await db.modelTask.create({
    data: {
      projectId: scene.projectId,
      sceneId: scene.id,
      queueJobId: scene.videoJobId || null,
      provider: videoResult.provider,
      model: videoResult.model,
      taskType,
      externalTaskId: videoResult.externalTaskId || scene.externalTaskId || null,
      status: "completed",
      attempt: 1,
      maxAttempts: Number(process.env.SCENE_VIDEO_ATTEMPTS || 1),
      inputJson: taskInput,
      outputJson: {
        videoUrl: videoResult.videoUrl,
        raw: videoResult.raw || null
      },
      latencyMs: Date.now() - taskStartedMs,
      startedAt: taskStartedAt,
      completedAt: new Date()
    }
  });

  await db.modelTask.create({
    data: {
      projectId: scene.projectId,
      sceneId: scene.id,
      queueJobId: scene.videoJobId || null,
      provider: "onevideo",
      model: "quality-heuristic-v1",
      taskType: "quality_check",
      status: quality.reviewStatus,
      inputJson: {
        videoUrl: videoResult.videoUrl,
        prompt: taskInput.prompt,
        referenceImageUrl: taskInput.referenceImageUrl || null,
        firstFrameUrl: taskInput.firstFrameUrl || null,
        qaFrameUrl: qaFrame?.url || null,
        continuityAnchor: taskInput.continuityAnchor || null
      },
      outputJson: quality,
      startedAt: taskStartedAt,
      completedAt: new Date()
    }
  });

  await db.asset.create({
    data: {
      projectId: scene.projectId,
      sceneId: scene.id,
      type: "video",
      url: videoResult.videoUrl,
      mimeType: "video/mp4",
      metadata: {
        provider: videoResult.provider,
        model: videoResult.model,
        durationSeconds: scene.durationSeconds,
        sceneIndex: scene.sceneIndex,
        qaFrameUrl: qaFrame?.url || null,
        quality
      }
    }
  });

  if (quality.reviewStatus === "needs_review" && shouldAutoRetryLowQualityScenes()) {
    const maxAutoRetries = Number(process.env.VIDEO_QUALITY_AUTO_RETRY_LIMIT || 1);
    const lowQualityAttempts = await db.modelTask.count({
      where: {
        sceneId: scene.id,
        taskType: "quality_check",
        status: "needs_review"
      }
    });

    if (lowQualityAttempts <= maxAutoRetries) {
      await enqueueSceneVideo(scene.id, "retry");
      await updateProjectVideoAggregate(scene.projectId);
      return db.scene.findUniqueOrThrow({
        where: {
          id: scene.id
        }
      });
    }
  }

  await updateProjectVideoAggregate(scene.projectId);

  return updatedScene;
}

export async function runSceneVideoWorkflow(sceneId: string) {
  const scene = await db.scene.findUniqueOrThrow({
    where: {
      id: sceneId
    },
    include: {
      project: true
    }
  });

  const taskStartedAt = new Date();
  const taskStartedMs = Date.now();
  const taskInput = {
    prompt: scene.videoPrompt || scene.visualPrompt,
    durationSeconds: scene.durationSeconds,
    aspectRatio: scene.project.aspectRatio,
    referenceImageUrl: scene.referenceImageUrl || undefined,
    firstFrameUrl: scene.firstFrameUrl || scene.imageUrl || undefined,
    continuityAnchor: scene.continuityAnchor || undefined,
    entryState: scene.entryState || undefined,
    exitState: scene.exitState || undefined
  };

  await db.scene.update({
    where: {
      id: scene.id
    },
    data: {
      status: "generating_video",
      startedAt: taskStartedAt,
      failedAt: null,
      errorMessage: null
    }
  });

  try {
    if (shouldSplitProviderTask()) {
      const createResult = await createVideoTaskForScene({
        projectId: scene.projectId,
        sceneId: scene.id,
        sceneIndex: scene.sceneIndex,
        prompt: taskInput.prompt,
        durationSeconds: taskInput.durationSeconds,
        aspectRatio: taskInput.aspectRatio,
        referenceImageUrl: taskInput.referenceImageUrl,
        firstFrameUrl: taskInput.firstFrameUrl,
        continuityAnchor: taskInput.continuityAnchor
      });

      const updatedScene = await db.scene.update({
        where: {
          id: scene.id
        },
        data: {
          status: "polling_video",
          provider: createResult.provider,
          model: createResult.model,
          externalTaskId: createResult.externalTaskId,
          rawStatus: "created",
          errorMessage: null
        }
      });

      await db.modelTask.create({
        data: {
          projectId: scene.projectId,
          sceneId: scene.id,
          queueJobId: scene.videoJobId || null,
          provider: createResult.provider,
          model: createResult.model,
          taskType: `${createResult.generationType}_create`,
          externalTaskId: createResult.externalTaskId,
          status: "created",
          inputJson: taskInput,
          outputJson: {
            raw: createResult.raw || null,
            generationType: createResult.generationType
          },
          latencyMs: Date.now() - taskStartedMs,
          startedAt: taskStartedAt,
          completedAt: new Date()
        }
      });

      await enqueueSceneVideoPoll({
        projectId: scene.projectId,
        sceneId: scene.id,
        externalTaskId: createResult.externalTaskId,
        provider: createResult.provider,
        model: createResult.model,
        generationType: createResult.generationType,
        pollAttempt: 1
      });

      await updateProjectVideoAggregate(scene.projectId);

      return updatedScene;
    }

    const videoResult = await generateVideoForScene({
      projectId: scene.projectId,
      sceneId: scene.id,
      sceneIndex: scene.sceneIndex,
      prompt: taskInput.prompt,
      durationSeconds: taskInput.durationSeconds,
      aspectRatio: taskInput.aspectRatio,
      referenceImageUrl: taskInput.referenceImageUrl,
      firstFrameUrl: taskInput.firstFrameUrl,
      continuityAnchor: taskInput.continuityAnchor
    });

    return completeSceneVideo({
      scene,
      taskInput,
      videoResult,
      taskStartedAt,
      taskStartedMs,
      taskType: videoResult.raw && (videoResult.raw as any).createData?.generationType
        ? (videoResult.raw as any).createData.generationType
        : taskInput.firstFrameUrl
          ? "image_to_video"
          : "text_to_video"
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const providerError = error instanceof VideoProviderError ? error : null;

    await db.scene.update({
      where: {
        id: scene.id
      },
      data: {
        status: "failed",
        errorMessage: message,
        failedAt: new Date()
      }
    });

    await db.modelTask.create({
      data: {
        projectId: scene.projectId,
        sceneId: scene.id,
        queueJobId: scene.videoJobId || null,
        provider: providerError?.details.provider || process.env.VIDEO_PROVIDER || "unknown",
        model: providerError?.details.model || process.env.KLING_MODEL || "unknown",
        taskType: "text_to_video",
        externalTaskId: providerError?.details.externalTaskId || null,
        status: "failed",
        attempt: 1,
        maxAttempts: Number(process.env.SCENE_VIDEO_ATTEMPTS || 1),
        inputJson: taskInput,
        outputJson: providerError?.details.raw
          ? {
              raw: providerError.details.raw
            }
          : undefined,
        latencyMs: Date.now() - taskStartedMs,
        errorMessage: message,
        startedAt: taskStartedAt,
        failedAt: new Date()
      }
    });

    await updateProjectVideoAggregate(scene.projectId);

    throw error;
  }
}

export async function runSceneVideoPollWorkflow(jobData: SceneVideoJobData) {
  const scene = await db.scene.findUniqueOrThrow({
    where: {
      id: jobData.sceneId
    },
    include: {
      project: true
    }
  });
  const taskStartedAt = new Date();
  const taskStartedMs = Date.now();
  const externalTaskId = jobData.externalTaskId || scene.externalTaskId;
  const provider = jobData.provider || scene.provider || process.env.VIDEO_PROVIDER || "unknown";
  const model = jobData.model || scene.model || process.env.KLING_MODEL || "unknown";
  const generationType: VideoGenerationType =
    jobData.generationType || (scene.firstFrameUrl ? "image_to_video" : "text_to_video");
  const pollAttempt = jobData.pollAttempt || 1;
  const maxPollAttempts = Number(
    process.env.PROVIDER_POLL_ATTEMPTS || process.env.KLING_POLL_ATTEMPTS || 60
  );
  const taskInput = {
    prompt: scene.videoPrompt || scene.visualPrompt,
    durationSeconds: scene.durationSeconds,
    aspectRatio: scene.project.aspectRatio,
    referenceImageUrl: scene.referenceImageUrl || undefined,
    firstFrameUrl: scene.firstFrameUrl || scene.imageUrl || undefined,
    continuityAnchor: scene.continuityAnchor || undefined,
    entryState: scene.entryState || undefined,
    exitState: scene.exitState || undefined
  };

  if (!externalTaskId) {
    const message = "Scene poll skipped because no provider task id was stored.";
    await db.scene.update({
      where: {
        id: scene.id
      },
      data: {
        status: "failed",
        errorMessage: message,
        failedAt: new Date()
      }
    });
    await updateProjectVideoAggregate(scene.projectId);
    return db.scene.findUniqueOrThrow({ where: { id: scene.id } });
  }

  const poll = await pollVideoTaskForScene({
    provider,
    model,
    externalTaskId,
    generationType
  });

  await db.modelTask.create({
    data: {
      projectId: scene.projectId,
      sceneId: scene.id,
      queueJobId: scene.videoJobId || null,
      provider,
      model,
      taskType: "provider_poll",
      externalTaskId,
      status: poll.status,
      rawStatus: poll.rawStatus || null,
      attempt: pollAttempt,
      maxAttempts: maxPollAttempts,
      inputJson: {
        externalTaskId,
        generationType
      },
      outputJson: {
        videoUrl: poll.videoUrl || null,
        raw: poll.raw || null
      },
      latencyMs: Date.now() - taskStartedMs,
      errorMessage: poll.errorMessage || null,
      startedAt: taskStartedAt,
      completedAt: poll.status === "pending" ? null : new Date(),
      failedAt: poll.status === "failed" ? new Date() : null
    }
  });

  if (poll.status === "pending") {
    if (pollAttempt >= maxPollAttempts) {
      const message = `Provider poll timeout after ${maxPollAttempts} attempts.`;
      await db.scene.update({
        where: {
          id: scene.id
        },
        data: {
          status: "failed",
          rawStatus: poll.rawStatus || "timeout",
          errorMessage: message,
          failedAt: new Date()
        }
      });
      await updateProjectVideoAggregate(scene.projectId);
      return db.scene.findUniqueOrThrow({ where: { id: scene.id } });
    }

    await db.scene.update({
      where: {
        id: scene.id
      },
      data: {
        status: "polling_video",
        rawStatus: poll.rawStatus || "pending",
        errorMessage: null
      }
    });

    await enqueueSceneVideoPoll({
      projectId: scene.projectId,
      sceneId: scene.id,
      externalTaskId,
      provider,
      model,
      generationType,
      pollAttempt: pollAttempt + 1
    });

    await updateProjectVideoAggregate(scene.projectId);
    return db.scene.findUniqueOrThrow({ where: { id: scene.id } });
  }

  if (poll.status === "failed" || !poll.videoUrl) {
    const message = poll.errorMessage || "Provider task failed without a video URL.";
    await db.scene.update({
      where: {
        id: scene.id
      },
      data: {
        status: "failed",
        rawStatus: poll.rawStatus || "failed",
        errorMessage: message,
        failedAt: new Date()
      }
    });
    await updateProjectVideoAggregate(scene.projectId);
    return db.scene.findUniqueOrThrow({ where: { id: scene.id } });
  }

  return completeSceneVideo({
    scene,
    taskInput,
    videoResult: {
      provider,
      model,
      videoUrl: poll.videoUrl,
      externalTaskId,
      raw: poll.raw || null
    },
    taskStartedAt,
    taskStartedMs,
    taskType: generationType
  });
}