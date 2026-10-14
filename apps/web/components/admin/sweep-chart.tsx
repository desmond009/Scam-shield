"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, TooltipCard } from "@/components/charts/chart-tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pct } from "@/lib/format";
import type { Evaluation, SystemKey, ThresholdMetrics } from "@/lib/types";
import { ChartLegend } from "./chart-legend";
import { DataTable } from "./data-table";
import { SYSTEM_BY_KEY, SYSTEMS } from "./labels";

/** Colour stays the selected system's; the three rates are told apart by dash pattern and label. */
const METRICS = [
  { key: "precision", label: "Precision", dash: undefined },
  { key: "recall", label: "Recall", dash: "6 4" },
  { key: "fpr", label: "False-positive rate", dash: "2 3" },
] as const;

export function SweepChart({ ev, showTable }: { ev: Evaluation; showTable: boolean }) {
  const [system, setSystem] = useState<SystemKey>("hybrid");
  const { color } = SYSTEM_BY_KEY[system];
  const data = ev.systems[system].sweep;
  const { mediumThreshold: med, highThreshold: high } = ev.thresholds;

  return (
    <div>
      <Tabs value={system} onValueChange={(v) => setSystem(v as SystemKey)} className="mb-3">
        <TabsList aria-label="System">
          {SYSTEMS.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.short}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ChartLegend items={METRICS.map((m) => ({ label: m.label, color, dash: m.dash }))} />
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 20, right: 12, left: 0, bottom: 16 }}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis
              dataKey="threshold"
              type="number"
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              label={{ value: "Score threshold", position: "insideBottom", offset: -10, fill: "var(--muted-foreground)", fontSize: 12 }}
              {...axisProps}
            />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} axisLine={false} {...axisProps} />
            <ReferenceLine x={med} stroke="var(--axis)" strokeDasharray="3 3" label={{ value: `Medium ${med}`, position: "top", fill: "var(--muted-foreground)", fontSize: 11 }} />
            <ReferenceLine x={high} stroke="var(--axis)" strokeDasharray="3 3" label={{ value: `High ${high}`, position: "top", fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const m = payload[0].payload as ThresholdMetrics;
                return (
                  <TooltipCard
                    title={`${SYSTEM_BY_KEY[system].short} · score ≥ ${m.threshold}`}
                    rows={[
                      { label: "Precision", value: pct(m.precision), color },
                      { label: "Recall", value: pct(m.recall), color },
                      { label: "False-positive rate", value: pct(m.fpr, 2), color },
                      { label: "Flag rate", value: pct(m.flag_rate, 2) },
                    ]}
                  />
                );
              }}
            />
            {METRICS.map((m) => (
              <Line
                key={m.key}
                dataKey={m.key}
                name={m.label}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={m.dash}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showTable && (
        <DataTable
          caption={`Threshold sweep for ${SYSTEM_BY_KEY[system].label}`}
          rowKey={(r) => String(r.threshold)}
          rows={data}
          columns={[
            { header: "Threshold", numeric: true, cell: (r) => r.threshold },
            { header: "Precision", numeric: true, cell: (r) => pct(r.precision) },
            { header: "Recall", numeric: true, cell: (r) => pct(r.recall) },
            { header: "FPR", numeric: true, cell: (r) => pct(r.fpr, 2) },
            { header: "Flag rate", numeric: true, cell: (r) => pct(r.flag_rate, 2) },
          ]}
        />
      )}
    </div>
  );
}
