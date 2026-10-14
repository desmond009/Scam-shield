import { cn } from "@/lib/utils";
import type { StreamStatus } from "./use-alert-stream";

const LABEL: Record<StreamStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
};

/** Connection state of the live alert feed: a dot plus a text label, announced politely to screen readers. */
export function LiveIndicator({ status }: { status: StreamStatus }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
      <span className="relative flex size-2" aria-hidden>
        {status === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", status === "live" ? "bg-good" : "bg-warning-mark")} />
      </span>
      <span>
        <span className="sr-only">Alert feed: </span>
        {LABEL[status]}
      </span>
    </span>
  );
}
