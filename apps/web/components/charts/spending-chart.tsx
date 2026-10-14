"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/format";
import { axisProps, TooltipCard } from "./chart-tooltip";

interface Day {
  day: string;
  total: number;
  count: number;
}

/** Fills missing days with zero so gaps read as "no spending" rather than disappearing. */
function lastNDays(data: Day[], n = 30): Day[] {
  const byDay = new Map(data.map((d) => [d.day, d]));
  const out: Day[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
    out.push(byDay.get(d) ?? { day: d, total: 0, count: 0 });
  }
  return out;
}

const shortDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function SpendingChart({ data }: { data: Day[] }) {
  // Stable data reference: Recharts restarts its animation whenever the data array identity changes.
  const days = useMemo(() => lastNDays(data), [data]);
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={days} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" {...axisProps} tickFormatter={shortDate} interval={6} />
          <YAxis {...axisProps} axisLine={false} width={56} tickFormatter={(v) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={shortDate(payload[0].payload.day)}
                  rows={[
                    { label: "Spent", value: formatINR(payload[0].payload.total), color: "var(--series-1)" },
                    { label: "Payments", value: payload[0].payload.count },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="total" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
