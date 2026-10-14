"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, TooltipCard } from "@/components/charts/chart-tooltip";
import { pct } from "@/lib/format";
import type { Evaluation, SystemKey } from "@/lib/types";
import { ChartLegend } from "./chart-legend";
import { DataTable, SeriesName } from "./data-table";
import { SYSTEMS } from "./labels";

type Pt = { recall: number; precision: number };
type Row = { recall: number } & Record<SystemKey, number>;

/** Linear interpolation of precision at a given recall (the straight segments a line chart would draw anyway). */
function precisionAt(curve: Pt[], r: number): number {
  const pts = [...curve].sort((a, b) => a.recall - b.recall || b.precision - a.precision);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (r >= a.recall && r <= b.recall) {
      if (b.recall === a.recall) return Math.max(a.precision, b.precision);
      return a.precision + ((r - a.recall) / (b.recall - a.recall)) * (b.precision - a.precision);
    }
  }
  return pts.at(-1)?.precision ?? 0;
}

function buildRows(ev: Evaluation, step: number): Row[] {
  const n = Math.round(1 / step);
  return Array.from({ length: n + 1 }, (_, i) => {
    const recall = Math.round(i * step * 1000) / 1000;
    const row = { recall } as Row;
    for (const s of SYSTEMS) row[s.key] = Math.round(precisionAt(ev.systems[s.key].pr_curve, recall) * 10_000) / 10_000;
    return row;
  });
}

/** Label each curve where the three are furthest apart (between 50% and 95% recall), nudged to avoid overlap. */
function labelPositions(rows: Row[]) {
  const candidates = rows.filter((r) => r.recall >= 0.5 && r.recall <= 0.95);
  const gap = (r: Row) => {
    const v = SYSTEMS.map((s) => r[s.key]).sort((a, b) => a - b);
    return Math.min(v[1] - v[0], v[2] - v[1]);
  };
  const best = candidates.reduce((a, b) => (gap(b) > gap(a) ? b : a), candidates[0]);
  const placed = SYSTEMS.map((s) => ({ key: s.key, short: s.short, y: best[s.key] })).sort((a, b) => a.y - b.y);
  const MIN = 0.07;
  for (let i = 1; i < placed.length; i++) placed[i].y = Math.max(placed[i].y, placed[i - 1].y + MIN);
  return { x: best.recall, labels: placed };
}

export function PrCurveChart({ ev, showTable }: { ev: Evaluation; showTable: boolean }) {
  const rows = buildRows(ev, 0.01);
  const { x, labels } = labelPositions(rows);
  return (
    <div>
      <ChartLegend items={SYSTEMS.map((s) => ({ label: `${s.label} (PR-AUC ${ev.systems[s.key].pr_auc.toFixed(3)})`, color: s.color }))} />
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 16 }}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis
              dataKey="recall"
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              label={{ value: "Recall (scams caught)", position: "insideBottom", offset: -10, fill: "var(--muted-foreground)", fontSize: 12 }}
              {...axisProps}
            />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              width={44}
              axisLine={false}
              {...axisProps}
            />
            <Tooltip
              cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={`Recall ${pct(payload[0].payload.recall, 0)}`}
                    rows={SYSTEMS.map((s) => ({ label: `${s.short} precision`, value: pct(payload[0].payload[s.key]), color: s.color }))}
                  />
                ) : null
              }
            />
            {SYSTEMS.map((s) => (
              <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
            ))}
            {labels.map((l) => (
              <ReferenceDot
                key={l.key}
                x={x}
                y={Math.min(l.y, 1)}
                r={0}
                ifOverflow="visible"
                label={{ value: l.short, position: "top", fill: "var(--foreground)", fontSize: 12, fontWeight: 600, stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showTable && (
        <DataTable
          caption="Precision at selected recall levels"
          rowKey={(r) => String(r.recall)}
          rows={rows.filter((_, i) => i % 10 === 0)}
          columns={[
            { header: "Recall", numeric: true, cell: (r) => pct(r.recall, 0) },
            ...SYSTEMS.map((s) => ({ header: <SeriesName color={s.color}>{s.short} precision</SeriesName>, numeric: true, cell: (r: Row) => pct(r[s.key]) })),
          ]}
        />
      )}
    </div>
  );
}
