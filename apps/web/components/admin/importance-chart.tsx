"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, TooltipCard } from "@/components/charts/chart-tooltip";
import type { Evaluation } from "@/lib/types";
import { DataTable } from "./data-table";
import { featureName } from "./labels";

export function ImportanceChart({ ev, showTable }: { ev: Evaluation; showTable: boolean }) {
  const data = ev.feature_importance.slice(0, 12).map((d) => ({ ...d, label: featureName(d.feature) }));
  return (
    <div>
      <div className="w-full" style={{ height: data.length * 30 + 40 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="var(--grid)" />
            <XAxis type="number" {...axisProps} tickFormatter={(v) => v.toFixed(2)} />
            <YAxis type="category" dataKey="label" width={170} axisLine={false} {...axisProps} interval={0} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={payload[0].payload.label}
                    rows={[{ label: "Drop in PR-AUC when shuffled", value: payload[0].payload.importance.toFixed(4), color: "var(--series-2)" }]}
                  />
                ) : null
              }
            />
            <Bar dataKey="importance" fill="var(--series-2)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {showTable && (
        <DataTable
          caption="Feature importance"
          rowKey={(r) => r.feature}
          rows={data}
          columns={[
            { header: "Feature", cell: (r) => r.label },
            { header: "Importance", numeric: true, cell: (r) => r.importance.toFixed(4) },
          ]}
        />
      )}
    </div>
  );
}
