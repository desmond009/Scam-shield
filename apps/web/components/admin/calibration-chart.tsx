"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, TooltipCard } from "@/components/charts/chart-tooltip";
import { pct } from "@/lib/format";
import type { Evaluation } from "@/lib/types";
import { ChartLegend } from "./chart-legend";
import { DataTable } from "./data-table";
import { SYSTEM_BY_KEY } from "./labels";

type Row = Evaluation["calibration"]["points"][number];

/** Ten equal-width bins over the ML probability; each point carries its own bin range and payment count. */
const rows = (ev: Evaluation): Row[] => ev.calibration.points;

const binLabel = ([lo, hi]: Row["bin"]) => `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;

export function CalibrationChart({ ev, showTable }: { ev: Evaluation; showTable: boolean }) {
  const data = rows(ev);
  const color = SYSTEM_BY_KEY.ml_only.color;
  return (
    <div>
      <ChartLegend
        items={[
          { label: "ML model (calibrated)", color },
          { label: "Perfect calibration", color: "var(--axis)", dash: "4 4" },
        ]}
      />
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 16 }}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis
              dataKey="predicted"
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              label={{ value: "Predicted fraud probability", position: "insideBottom", offset: -10, fill: "var(--muted-foreground)", fontSize: 12 }}
              {...axisProps}
            />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} axisLine={false} {...axisProps} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--axis)" strokeDasharray="4 4" ifOverflow="hidden" />
            <Tooltip
              cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as Row;
                return (
                  <TooltipCard
                    title={`Scores ${binLabel(r.bin)}`}
                    rows={[
                      { label: "Predicted (mean)", value: pct(r.predicted), color },
                      { label: "Observed fraud rate", value: pct(r.observed) },
                      { label: "Holdout payments in bin", value: r.count.toLocaleString("en-IN") },
                    ]}
                  />
                );
              }}
            />
            <Line
              dataKey="observed"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-subtle">Points near the diagonal mean a score of X% really does correspond to about X% fraud. Bins with few payments are noisy.</p>
      {showTable && (
        <DataTable
          caption="Calibration bins"
          rowKey={(r) => String(r.predicted)}
          rows={data}
          columns={[
            { header: "Score bin", cell: (r) => binLabel(r.bin) },
            { header: "Predicted", numeric: true, cell: (r) => pct(r.predicted) },
            { header: "Observed", numeric: true, cell: (r) => pct(r.observed) },
            { header: "Payments", numeric: true, cell: (r) => r.count.toLocaleString("en-IN") },
          ]}
        />
      )}
    </div>
  );
}
