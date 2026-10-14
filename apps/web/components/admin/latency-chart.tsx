"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, TooltipCard } from "../charts/chart-tooltip";

function bucketLabel(bucket: string) {
  if (bucket === "+Inf") return "> 1 s";
  const ms = Number(bucket);
  return ms >= 1000 ? `≤${ms / 1000} s` : `≤${ms} ms`;
}

/** Decision latency histogram (single series, so the card title names it and no legend is needed). */
export function LatencyChart({ histogram }: { histogram: { bucket: string; count: number }[] }) {
  const data = histogram.map((h) => ({ label: bucketLabel(h.bucket), count: h.count }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" {...axisProps} minTickGap={4} />
          <YAxis {...axisProps} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={`Latency ${payload[0].payload.label}`}
                  rows={[{ label: "Decisions", value: payload[0].payload.count.toLocaleString("en-IN"), color: "var(--series-1)" }]}
                />
              ) : null
            }
          />
          <Bar dataKey="count" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
