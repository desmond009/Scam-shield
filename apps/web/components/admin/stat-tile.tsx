import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A single labelled number; used instead of a one-bar chart. */
export function StatTile({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface px-4 py-3", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-subtle">{hint}</div>}
    </div>
  );
}
