import { Loader2, PlugZap } from "lucide-react";
import { BandBadge } from "@/components/band-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ApiError, errorMessage } from "@/lib/api";
import { pct } from "@/lib/format";
import { BANDS } from "@scamshield/shared";
import type { WhatIfMetrics, WhatIfResult } from "@/lib/types";
import { DataTable } from "./data-table";
import { pctPoints, scenarioName } from "./labels";

type Metric = { label: string; hint: string; get: (m: WhatIfMetrics) => number; digits: number };

const METRICS: Metric[] = [
  { label: "Precision", hint: "flagged payments that are scams", get: (m) => m.precision, digits: 1 },
  { label: "Recall", hint: "scams that get flagged", get: (m) => m.recall, digits: 1 },
  { label: "False-positive rate", hint: "genuine payments flagged", get: (m) => m.fpr, digits: 2 },
  { label: "Flag rate", hint: "all payments flagged", get: (m) => m.flagRate, digits: 2 },
];

function Delta({ value, digits }: { value: number; digits: number }) {
  if (Math.abs(value) < 10 ** -(digits + 2)) return <span className="text-subtle">no change</span>;
  return <span className="font-medium">{pctPoints(value, digits)}</span>;
}

export function WhatIfPanel({
  data,
  isFetching,
  error,
  blockedReason,
  onRetry,
}: {
  data: WhatIfResult | undefined;
  isFetching: boolean;
  error: unknown;
  blockedReason: string | null;
  onRetry: () => void;
}) {
  if (blockedReason) return <EmptyState title="Preview paused">{blockedReason}</EmptyState>;
  if (error && !data) {
    if (error instanceof ApiError && error.status === 503) {
      return (
        <EmptyState title="Preview unavailable" icon={<PlugZap className="size-8" />}>
          The what-if preview needs the ML service, which is not responding. You can still edit and save rules.
        </EmptyState>
      );
    }
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  if (!data) return <Skeleton className="h-72 w-full" />;

  const { current, proposed } = data;
  const scenarios = proposed.perScenario
    .map((p) => ({ ...p, current: current.perScenario.find((c) => c.scenario === p.scenario)?.flaggedRate ?? 0 }))
    .sort((a, b) => Number(b.isFraud) - Number(a.isFraud) || a.scenario.localeCompare(b.scenario));

  return (
    <div className="space-y-5" aria-busy={isFetching}>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {isFetching && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        Re-scores {data.sampleSize.toLocaleString("en-IN")} labelled synthetic holdout payments; the ML score is held fixed, only rules, weights and thresholds change.
      </p>
      {error != null && (
        <p role="alert" className="text-xs text-critical">
          Couldn&apos;t refresh the preview ({errorMessage(error)}). Showing the last result.
        </p>
      )}

      <DataTable
        caption="Current versus proposed detection metrics"
        rowKey={(m) => m.label}
        rows={METRICS}
        columns={[
          {
            header: "Metric",
            cell: (m) => (
              <span>
                {m.label}
                <span className="block text-xs text-subtle">{m.hint}</span>
              </span>
            ),
          },
          { header: "Current", numeric: true, cell: (m) => pct(m.get(current), m.digits) },
          { header: "Proposed", numeric: true, cell: (m) => <span className="font-medium">{pct(m.get(proposed), m.digits)}</span> },
          { header: "Change", numeric: true, cell: (m) => <Delta value={m.get(proposed) - m.get(current)} digits={m.digits} /> },
        ]}
      />

      <div>
        <p className="mb-1 text-sm font-medium">Band mix</p>
        <DataTable
          caption="Share of payments in each risk band"
          rowKey={(b) => b}
          rows={[...BANDS]}
          columns={[
            { header: "Band", cell: (b) => <BandBadge band={b} /> },
            { header: "Current", numeric: true, cell: (b) => pct(current.bands[b], 2) },
            { header: "Proposed", numeric: true, cell: (b) => <span className="font-medium">{pct(proposed.bands[b], 2)}</span> },
            { header: "Change", numeric: true, cell: (b) => <Delta value={proposed.bands[b] - current.bands[b]} digits={2} /> },
          ]}
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Flagged by scenario</p>
        <p className="mb-2 text-xs text-subtle">Scam scenarios: share caught (higher is better). Genuine scenarios: false alarms (lower is better).</p>
        <DataTable
          caption="Flagged rate per scenario"
          rowKey={(s) => s.scenario}
          rows={scenarios}
          columns={[
            {
              header: "Scenario",
              cell: (s) => (
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  {scenarioName(s.scenario)}
                  <Badge variant="outline">{s.isFraud ? "scam" : "genuine"}</Badge>
                </span>
              ),
            },
            { header: "Current", numeric: true, cell: (s) => pct(s.current) },
            { header: "Proposed", numeric: true, cell: (s) => <span className="font-medium">{pct(s.flaggedRate)}</span> },
            { header: "Change", numeric: true, cell: (s) => <Delta value={s.flaggedRate - s.current} digits={1} /> },
          ]}
        />
      </div>
    </div>
  );
}
