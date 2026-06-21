export function StatusPill({ status }: { status: string }) {
  const isDone = status === "completed";
  const isReady = status === "completed_clips";
  const isFailed = status === "failed" || status === "partial_failed" || status === "needs_review";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${isDone || isReady ? "bg-emerald-500/15 text-emerald-300" : isFailed ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>
      {status}
    </span>
  );
}
