"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StatusPill } from "./status-pill";
import { PublishModal } from "./publish-modal";
import { SaveTemplateButton } from "./template-grid";

type VisualBiblePayload = {
  protagonist?: string;
  wardrobe?: string;
  coreSetting?: string;
  propAnchors?: string[];
  visualStyle?: string;
};

type ScriptPayload = {
  hook?: string;
  body?: string;
  cta?: string;
  fullVoiceover?: string;
  visualBible?: VisualBiblePayload;
};

type ProjectSceneItem = {
  id: string;
  sceneIndex: number;
  durationSeconds: number;
  voiceover?: string | null;
  visualPrompt?: string | null;
  videoPrompt?: string | null;
  cameraMotion?: string | null;
  mood?: string | null;
  status: string;
  provider?: string | null;
  model?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
  firstFrameUrl?: string | null;
  qualityScore?: number | null;
  reviewStatus?: string | null;
  qualityNotes?: string | null;
  errorMessage?: string | null;
  entryState?: string | null;
  exitState?: string | null;
  continuityAnchor?: string | null;
};

type ProjectAssetItem = {
  id: string;
  type: string;
  url: string;
  mimeType?: string | null;
};

type ProjectModelTaskItem = {
  id: string;
  provider: string;
  model: string;
  taskType: string;
  status: string;
};

type ProjectPayload = {
  id: string;
  title?: string | null;
  topic: string;
  platform: string;
  language: string;
  durationSeconds: number;
  aspectRatio: string;
  status: string;
  progress?: number | null;
  queuedAt?: string | null;
  scriptJson?: ScriptPayload | null;
  finalVideoUrl?: string | null;
  thumbnailUrl?: string | null;
  totalCostCredits: number;
  errorMessage?: string | null;
  scenes: ProjectSceneItem[];
  assets: ProjectAssetItem[];
  modelTasks: ProjectModelTaskItem[];
};

type WorkerHealthPayload = {
  online: boolean;
  staleAfterSeconds: number;
  workers: Array<{
    name: string;
    queueName: string;
    status: string;
    lastSeenAt: string;
    isStale: boolean;
  }>;
};

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "partial_failed",
  "completed_clips",
  "needs_review"
]);

export function ProjectStatusView({
  initialProject
}: {
  initialProject: ProjectPayload;
}) {
  const [project, setProject] = useState<ProjectPayload>(initialProject);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [actionError, setActionError] = useState("");
  const [retryingSceneId, setRetryingSceneId] = useState("");
  const [approvingSceneId, setApprovingSceneId] = useState("");
  const [publishModalOpen, setPublishModalOpen] = useState(false);

  const isTerminal = TERMINAL_STATUSES.has(project.status);
  const [retryingAll, setRetryingAll] = useState(false);
  const script = project.scriptJson || {};
  const sceneClips = project.scenes.filter((scene: ProjectSceneItem) => scene.videoUrl);
  const subtitleAsset = project.assets.find((asset: ProjectAssetItem) => asset.type === "subtitle");
  const hasMultipleSceneClips = sceneClips.length > 1;
  const failedScenes = project.scenes.filter((scene: ProjectSceneItem) => scene.status === "failed");
  const reviewScenes = project.scenes.filter(
    (scene: ProjectSceneItem) =>
      scene.status === "needs_review" || scene.reviewStatus === "needs_review"
  );
  const allScenesCompleted =
    project.scenes.length > 0 &&
    project.scenes.every((scene: ProjectSceneItem) => scene.status === "completed");
  const legacyVideoReady = project.scenes.length === 0 && Boolean(project.finalVideoUrl);
  const canRenderProject = (allScenesCompleted || legacyVideoReady) && project.status !== "rendering";
  const queuedForSeconds =
    project.status === "queued" && project.queuedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(project.queuedAt).getTime()) / 1000))
      : 0;
  const isQueuedStale = queuedForSeconds >= 30;
  const isWorkerLikelyOffline = workerHealth ? !workerHealth.online : false;
  const progress = Math.max(
    0,
    Math.min(100, Number(project.progress ?? (project.status === "completed" ? 100 : 0)))
  );

  const progressLabel = useMemo(() => {
    if (project.status === "completed") return "Completed";
    if (project.status === "completed_clips") return "Clips ready";
    if (project.status === "partial_failed") return "Needs retry";
    if (project.status === "needs_review") return "Needs review";
    if (project.status === "failed") return "Failed";
    if (project.status === "queued") return "Queued";
    if (project.status === "rendering") return "Rendering";
    return "Generating";
  }, [project.status]);

  const visualBible = script.visualBible;

  async function refreshProject() {
    setRefreshing(true);

    try {
      const res = await fetch(`/api/projects/${project.id}/status`, {
        cache: "no-store"
      });

      if (!res.ok) {
        setActionError("Failed to refresh project status.");
        return;
      }

      const data = await res.json();
      setProject(data.project);
      setWorkerHealth(data.workerHealth || null);
    } catch {
      setActionError("Failed to refresh project status.");
    } finally {
      setRefreshing(false);
    }
  }

  async function retryProject() {
    setRetrying(true);
    setActionError("");

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "POST"
      });

      if (res.ok) {
        await refreshProject();
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Project retry failed.");
      }
    } catch {
      setActionError("Project retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  async function retryScene(sceneId: string) {
    setRetryingSceneId(sceneId);
    setActionError("");

    try {
      const res = await fetch(`/api/scenes/${sceneId}/retry`, {
        method: "POST"
      });

      if (res.ok) {
        await refreshProject();
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Scene retry failed.");
      }
    } catch {
      setActionError("Scene retry failed.");
    } finally {
      setRetryingSceneId("");
    }
  }

  async function approveScene(sceneId: string) {
    setApprovingSceneId(sceneId);
    setActionError("");

    try {
      const res = await fetch(`/api/scenes/${sceneId}/approve`, {
        method: "POST"
      });

      if (res.ok) {
        await refreshProject();
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Scene approval failed.");
      }
    } catch {
      setActionError("Scene approval failed.");
    } finally {
      setApprovingSceneId("");
    }
  }

  async function retryAllFailed() {
    setRetryingAll(true);
    setActionError("");
    try {
      await Promise.all(failedScenes.map((s: ProjectSceneItem) =>
        fetch(`/api/scenes/${s.id}/retry`, { method: "POST" })
      ));
      await refreshProject();
    } catch {
      setActionError("Batch retry failed.");
    } finally {
      setRetryingAll(false);
    }
  }

  async function renderProject() {
    setRendering(true);
    setActionError("");

    try {
      const res = await fetch(`/api/projects/${project.id}/render`, {
        method: "POST"
      });

      if (res.ok) {
        await refreshProject();
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Render request failed.");
      }
    } catch {
      setActionError("Render request failed.");
    } finally {
      setRendering(false);
    }
  }

  useEffect(() => {
    if (isTerminal) return;

    // SSE 推送，降级到轮询
    if (typeof window !== "undefined" && typeof EventSource !== "undefined") {
      const es = new EventSource(`/api/projects/${project.id}/stream`);

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.project) setProject(data.project);
          if (data.workerHealth !== undefined) setWorkerHealth(data.workerHealth);
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        // fallback: 轮询一次恢复状态
        void refreshProject();
      };

      return () => es.close();
    }

    // fallback polling
    void refreshProject();
    const timer = window.setInterval(() => void refreshProject(), 3000);
    return () => window.clearInterval(timer);
  }, [project.id, isTerminal]);

  // 分步进度 steps
  const steps = [
    { key: "script",    label: "生成脚本",   done: !!project.scriptJson },
    { key: "storyboard",label: "生成分镜",   done: project.scenes.length > 0 },
    { key: "clips",     label: `视频片段 ${sceneClips.length}/${project.scenes.length || "?"}`,
                                             done: allScenesCompleted },
    { key: "render",    label: "合成输出",   done: !!project.finalVideoUrl },
  ];
  const currentStep = steps.findIndex(s => !s.done);
  const estimatedRemaining = !isTerminal && project.scenes.length > 0
    ? Math.ceil((project.scenes.length - sceneClips.length) * 4) // ~4 min/clip
    : null;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 py-6 sm:py-10 lg:grid-cols-12">
      <section className="lg:col-span-8">
        <div className="rounded-3xl border border-line bg-panel p-5">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">{project.title || "Untitled Video"}</h1>
              <p className="mt-3 text-muted">{project.topic}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={project.status} />
              {canRenderProject && (
                <button onClick={renderProject} disabled={rendering}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60 transition-colors">
                  <RefreshCw className={`h-4 w-4 ${rendering ? "animate-spin" : ""}`} />
                  {project.finalVideoUrl ? "重新渲染" : "合成 MP4"}
                </button>
              )}
              {failedScenes.length > 1 && (
                <button onClick={retryAllFailed} disabled={retryingAll}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-60 transition-colors">
                  <RefreshCw className={`h-4 w-4 ${retryingAll ? "animate-spin" : ""}`} />
                  重试全部失败 ({failedScenes.length})
                </button>
              )}
              {isTerminal && (
                <button onClick={retryProject} disabled={retrying}
                  className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium disabled:opacity-60">
                  <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
                  {project.status === "failed" ? "重新生成" : "再次生成"}
                </button>
              )}
            </div>
          </div>

          {/* 分步进度追踪 */}
          <div className="mt-6">
            <div className="flex items-center gap-0">
              {steps.map((step, i) => (
                <div key={step.key} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all
                      ${step.done ? "bg-emerald-500 text-white" :
                        i === currentStep && !isTerminal ? "bg-violet-500 text-white animate-pulse" :
                        project.status === "failed" && i === currentStep ? "bg-red-500 text-white" :
                        "bg-soft text-muted"}`}>
                      {step.done ? "✓" : i + 1}
                    </div>
                    <span className={`text-xs text-center leading-tight
                      ${step.done ? "text-emerald-400" :
                        i === currentStep ? "text-white" : "text-muted"}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 mb-4 rounded ${step.done ? "bg-emerald-500" : "bg-soft"}`} />
                  )}
                </div>
              ))}
            </div>
            {estimatedRemaining && estimatedRemaining > 0 && (
              <p className="mt-3 text-xs text-muted text-center">
                预计还需约 {estimatedRemaining} 分钟
              </p>
            )}
          </div>

          {/* 进度条 */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{progressLabel}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-soft">
              <div className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${progress}%` }} />
            </div>
            {refreshing && <p className="mt-2 text-xs text-muted">刷新中...</p>}
          </div>

          {/* 告警 */}
          {(isQueuedStale || isWorkerLikelyOffline) && (
            <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
              {isWorkerLikelyOffline ? "未检测到 Worker 心跳。" : `已排队 ${queuedForSeconds}s。`}{" "}
              请在终端运行 <span className="font-mono">pnpm worker</span>。
            </p>
          )}
          {project.errorMessage && (
            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              <span className="font-semibold">错误：</span>{project.errorMessage}
            </div>
          )}
          {actionError && (
            <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{actionError}</p>
          )}

          {project.finalVideoUrl && (
            <div className="mt-6">
              <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
                <video
                  className="max-h-[720px] w-full object-contain"
                  src={project.finalVideoUrl}
                  controls
                  autoPlay={false}
                  poster={project.thumbnailUrl || undefined}
                >
                  {subtitleAsset?.url && (
                    <track kind="subtitles" src={subtitleAsset.url}
                      srcLang={project.language === "zh" ? "zh" : "en"}
                      label={project.language === "zh" ? "中文" : "English"} default />
                  )}
                </video>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={project.finalVideoUrl} download
                  className="rounded-xl border border-line bg-soft px-4 py-2 text-sm hover:border-zinc-400 transition-colors">
                  ⬇ 下载 MP4
                </a>
                <SaveTemplateButton projectId={project.id} />
                <button onClick={() => setPublishModalOpen(true)}
                  className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-sm text-violet-300 hover:bg-violet-500/20 transition-colors font-semibold">
                  🚀 一键发布
                </button>
                <button onClick={renderProject} disabled={rendering}
                  className="ml-auto rounded-xl border border-line px-4 py-2 text-sm text-muted hover:border-zinc-400 transition-colors disabled:opacity-50">
                  <RefreshCw className={`inline h-3.5 w-3.5 mr-1 ${rendering ? "animate-spin" : ""}`} />
                  重新渲染
                </button>
              </div>
            </div>
          )}

          <PublishModal
            projectId={project.id}
            projectTitle={project.title}
            projectTopic={project.topic}
            isOpen={publishModalOpen}
            onClose={() => setPublishModalOpen(false)}
          />

          {!project.finalVideoUrl && hasMultipleSceneClips && (
            <p className="mt-6 rounded-2xl border border-line bg-soft p-4 text-sm text-muted">
              {sceneClips.length} scene clips generated.
              {allScenesCompleted
                ? " Ready to render final MP4 with voiceover. Use the Render MP4 button above."
                : " Waiting for the remaining scene clips."}
            </p>
          )}

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            <Metric label="Platform" value={project.platform} />
            <Metric label="Duration" value={`${project.durationSeconds}s`} />
            <Metric label="Ratio" value={project.aspectRatio} />
            <Metric label="Clips" value={String(sceneClips.length)} />
            <Metric label="Credits" value={String(project.totalCostCredits)} />
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-line bg-panel p-5">
          <h2 className="text-2xl font-bold">Scene Timeline</h2>
          {failedScenes.length > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-100">
              <span>⚠ {failedScenes.length} 个场景生成失败</span>
              <button onClick={retryAllFailed} disabled={retryingAll}
                className="inline-flex items-center gap-1 rounded-lg border border-red-400/30 px-3 py-1 text-xs font-medium hover:bg-red-500/20 disabled:opacity-60">
                <RefreshCw className={`h-3 w-3 ${retryingAll ? "animate-spin" : ""}`} />
                一键重试
              </button>
            </div>
          )}
          {reviewScenes.length > 0 && (
            <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
              🔍 {reviewScenes.length} 个场景质量待审核，可单独重试提升画质。
            </p>
          )}

          <div className="mt-5 space-y-3">
            {project.scenes.map((scene: ProjectSceneItem) => {
              const isFailed = scene.status === "failed";
              const isReview = scene.status === "needs_review" || scene.reviewStatus === "needs_review";
              const isPending = scene.status === "pending" || scene.status === "queued";
              const isGenerating = scene.status === "generating_video" || scene.status === "polling_video";
              return (
              <div key={scene.id} className={`rounded-2xl border p-4 transition-colors
                ${isFailed ? "border-red-500/30 bg-red-500/5" :
                  isReview ? "border-amber-500/30 bg-amber-500/5" :
                  scene.status === "completed" ? "border-emerald-500/20 bg-soft" :
                  "border-line bg-soft"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold
                      ${scene.status === "completed" ? "bg-emerald-500 text-white" :
                        isFailed ? "bg-red-500 text-white" :
                        isGenerating ? "bg-violet-500 text-white animate-pulse" :
                        "bg-soft text-muted border border-line"}`}>
                      {scene.status === "completed" ? "✓" : isFailed ? "✗" : scene.sceneIndex}
                    </span>
                    <h3 className="font-semibold text-sm">场景 {scene.sceneIndex}</h3>
                    {scene.mood && <span className="rounded-full bg-soft px-2 py-0.5 text-xs text-muted">{scene.mood}</span>}
                    <span className="text-xs text-muted">{scene.durationSeconds}s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(isFailed || isReview) && (
                      <button onClick={() => retryScene(scene.id)} disabled={retryingSceneId === scene.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium disabled:opacity-60 hover:bg-soft">
                        <RefreshCw className={`h-3 w-3 ${retryingSceneId === scene.id ? "animate-spin" : ""}`} />
                        重试
                      </button>
                    )}
                    {scene.videoUrl && isReview && (
                      <button onClick={() => approveScene(scene.id)} disabled={approvingSceneId === scene.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 disabled:opacity-60">
                        通过
                      </button>
                    )}
                    <StatusPill status={scene.status} />
                  </div>
                </div>

                {scene.videoUrl ? (
                  <div className="mt-3 overflow-hidden rounded-xl bg-black">
                    <video className="max-h-[480px] w-full object-contain" src={scene.videoUrl}
                      controls poster={scene.imageUrl || undefined} />
                  </div>
                ) : scene.firstFrameUrl ? (
                  <div className="mt-3 overflow-hidden rounded-xl bg-black">
                    <img className="max-h-[360px] w-full object-contain"
                      src={scene.firstFrameUrl} alt={`场景 ${scene.sceneIndex} 参考帧`} />
                  </div>
                ) : isPending ? (
                  <div className="mt-3 flex h-16 items-center justify-center rounded-xl bg-black/40 text-xs text-muted">
                    等待生成...
                  </div>
                ) : isGenerating ? (
                  <div className="mt-3 flex h-16 items-center justify-center rounded-xl bg-violet-500/5 border border-violet-500/20 text-xs text-violet-300">
                    <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                    AI 正在生成视频...
                  </div>
                ) : null}

                {scene.errorMessage && (
                  <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
                    <span className="font-semibold">失败原因：</span>{scene.errorMessage}
                  </div>
                )}
                {scene.qualityNotes && !scene.errorMessage && (
                  <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-100">
                    {scene.qualityNotes}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted line-clamp-2">{scene.voiceover}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-600">
                  {scene.provider && <span>{scene.provider}</span>}
                  {scene.qualityScore != null && <span>质量 {scene.qualityScore}</span>}
                  {scene.continuityAnchor && <span className="truncate max-w-[200px]">{scene.continuityAnchor}</span>}
                </div>
              </div>
              );
            })}
            {project.scenes.length === 0 && (
              <div className="flex h-20 items-center justify-center rounded-2xl border border-line bg-soft text-sm text-muted">
                等待生成分镜脚本...
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-6 lg:col-span-4">
        <Panel title="Script">
          <h3 className="font-semibold">Hook</h3>
          <p className="mt-2 text-sm text-muted">{script.hook || "-"}</p>
          <h3 className="mt-5 font-semibold">Body</h3>
          <p className="mt-2 text-sm text-muted">{script.body || "-"}</p>
          <h3 className="mt-5 font-semibold">CTA</h3>
          <p className="mt-2 text-sm text-muted">{script.cta || "-"}</p>
        </Panel>
        {visualBible && (
          <Panel title="Continuity">
            <div className="space-y-4 text-sm text-muted">
              <Field label="Protagonist" value={visualBible.protagonist} />
              <Field label="Wardrobe" value={visualBible.wardrobe} />
              <Field label="Setting" value={visualBible.coreSetting} />
              <Field
                label="Props"
                value={
                  Array.isArray(visualBible.propAnchors)
                    ? visualBible.propAnchors.join(", ")
                    : ""
                }
              />
              <Field label="Style" value={visualBible.visualStyle} />
            </div>
          </Panel>
        )}
        <Panel title="Assets">
          <div className="space-y-3 text-sm text-muted">
            {project.assets.map((asset: ProjectAssetItem) => (
              <div key={asset.id} className="rounded-xl bg-soft p-3">
                <a href={asset.url} target="_blank" rel="noreferrer">
                  {asset.type}: {asset.mimeType || "-"}
                </a>
              </div>
            ))}
            {project.assets.length === 0 && <p>No assets yet.</p>}
          </div>
        </Panel>
        <Panel title="Model Tasks">
          <div className="space-y-3 text-sm text-muted">
            {project.modelTasks.map((task: ProjectModelTaskItem) => (
              <div key={task.id} className="rounded-xl bg-soft p-3">
                {task.taskType} · {task.provider} · {task.status}
              </div>
            ))}
            {project.modelTasks.length === 0 && <p>No model tasks yet.</p>}
          </div>
        </Panel>
      </aside>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-soft p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-zinc-200">{value || "-"}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-line bg-panel p-5">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}