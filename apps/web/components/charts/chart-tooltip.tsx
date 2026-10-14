import type { ReactNode } from "react";

/** Shared tooltip chrome for Recharts: surface card, text in ink tokens, series identified by a swatch. */
export function TooltipCard({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-muted-foreground">
          {r.color && <span className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
          <span>{r.label}</span>
          <span className="tabular ml-auto pl-3 font-medium text-foreground">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: "var(--subtle)", fontSize: 11 },
  tickLine: false,
} as const;
