import type { RenderedReason } from "@/lib/types";
import { DetailSection } from "./detail-section";

export function ReasonsPanel({ reasons }: { reasons: RenderedReason[] }) {
  return (
    <DetailSection title={`Reasons (${reasons.length})`} description="What the user was told, plus the technical detail behind each signal.">
      {reasons.length ? (
        <ol className="space-y-2">
          {reasons.map((r) => (
            <li key={r.code} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{r.title}</p>
                <span className="tabular shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">+{r.points} pts</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r.message}</p>
              <p className="mt-1.5 text-xs text-subtle">
                <span className="font-mono">{r.code}</span> · {r.detail}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No individual signals fired.</p>
      )}
    </DetailSection>
  );
}
