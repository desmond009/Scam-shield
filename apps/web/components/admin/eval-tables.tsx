"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pct } from "@/lib/format";
import type { Evaluation, SystemKey, ThresholdMetrics } from "@/lib/types";
import { DataTable, SeriesName } from "./data-table";
import { scenarioName, SYSTEM_BY_KEY, SYSTEMS } from "./labels";

/** The one-sentence answer to "does the hybrid beat rules?", stated as data. */
export function Headline({ ev }: { ev: Evaluation }) {
  const m = ev.matched_fpr;
  const hybrid = m.systems.hybrid;
  const rules = m.systems.rules_only;
  const prBest = SYSTEMS.reduce((a, b) => (ev.systems[b.key].pr_auc > ev.systems[a.key].pr_auc ? b : a));
  return (
    <div className="space-y-4">
      <p className="text-lg font-medium leading-snug sm:text-xl">
        {hybrid && rules ? (
          ev.hybrid_beats_rules_on_recall_at_matched_fpr ? (
            <>
              At the same false-positive rate as rules-only ({pct(m.target_fpr)}), the hybrid catches{" "}
              <span className="tabular">{pct(hybrid.recall, 0)}</span> of scams vs <span className="tabular">{pct(rules.recall, 0)}</span>.
            </>
          ) : (
            <>
              At the same false-positive rate as rules-only ({pct(m.target_fpr)}), the hybrid does not catch more scams: {pct(hybrid.recall, 0)} vs{" "}
              {pct(rules.recall, 0)}.
            </>
          )
        ) : (
          <>No threshold keeps every system at or below rules-only&apos;s false-positive rate ({pct(m.target_fpr)}), so recall can&apos;t be compared at matched FPR.</>
        )}
      </p>
      <dl className="grid gap-3 sm:grid-cols-3">
        {SYSTEMS.map((s) => {
          const r = m.systems[s.key];
          return (
            <div key={s.key} className="rounded-lg border border-border p-3">
              <dt className="text-xs text-muted-foreground">
                <SeriesName color={s.color}>{s.label}</SeriesName>
              </dt>
              <dd className="tabular mt-1 text-2xl font-semibold">{r ? pct(r.recall, 1) : "—"}</dd>
              <dd className="text-xs text-subtle">
                {r ? `scams caught at FPR ${pct(r.fpr, 2)} (score ≥ ${r.threshold})` : "no threshold meets the FPR"}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="text-sm text-muted-foreground">
        Overall ranking quality (PR-AUC): {SYSTEMS.map((s) => `${s.short} ${ev.systems[s.key].pr_auc.toFixed(3)}`).join(", ")}.{" "}
        {prBest.key !== "hybrid" &&
          `${prBest.label} ranks payments best on this metric. The hybrid keeps readable rule reasons and hard overrides, at the cost of some ranking quality here.`}
      </p>
    </div>
  );
}

const COLS: { header: string; cell: (m: ThresholdMetrics) => string }[] = [
  { header: "Precision", cell: (m) => pct(m.precision) },
  { header: "Recall", cell: (m) => pct(m.recall) },
  { header: "FPR", cell: (m) => pct(m.fpr, 2) },
  { header: "F1", cell: (m) => m.f1.toFixed(3) },
  { header: "Flag rate", cell: (m) => pct(m.flag_rate, 2) },
];

export function SystemComparison({ ev }: { ev: Evaluation }) {
  const [at, setAt] = useState<"at_medium" | "at_high">("at_medium");
  return (
    <div className="space-y-3">
      <Tabs value={at} onValueChange={(v) => setAt(v as typeof at)}>
        <TabsList aria-label="Threshold">
          <TabsTrigger value="at_medium">Medium (≥ {ev.thresholds.mediumThreshold})</TabsTrigger>
          <TabsTrigger value="at_high">High (≥ {ev.thresholds.highThreshold})</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable
        caption="Comparison of rules only, ML only and hybrid"
        rowKey={(s) => s.key}
        rows={SYSTEMS}
        columns={[
          { header: "System", cell: (s) => <SeriesName color={s.color}>{s.label}</SeriesName> },
          { header: "PR-AUC", numeric: true, cell: (s) => ev.systems[s.key].pr_auc.toFixed(3) },
          { header: "ROC-AUC", numeric: true, cell: (s) => ev.systems[s.key].roc_auc.toFixed(3) },
          ...COLS.map((c) => ({ header: c.header, numeric: true, cell: (s: (typeof SYSTEMS)[number]) => c.cell(ev.systems[s.key][at]) })),
        ]}
      />
    </div>
  );
}

function Cell({ tag, label, value, total }: { tag: string; label: string; value: number; total: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{tag}</span> · {label}
      </p>
      <p className="tabular mt-1 text-xl font-semibold">{value.toLocaleString("en-IN")}</p>
      <p className="tabular text-xs text-subtle">{pct(value / total, 2)} of holdout</p>
    </div>
  );
}

export function ConfusionMatrix({ ev, system }: { ev: Evaluation; system: SystemKey }) {
  const m = ev.systems[system].at_medium;
  const total = m.tp + m.fp + m.fn + m.tn;
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium">
        <SeriesName color={SYSTEM_BY_KEY[system].color}>{SYSTEM_BY_KEY[system].label}</SeriesName>
      </figcaption>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-sm">
        <span />
        <span className="text-center text-xs text-muted-foreground">Allowed (score &lt; {m.threshold})</span>
        <span className="text-center text-xs text-muted-foreground">Flagged (score ≥ {m.threshold})</span>
        <span className="self-center text-xs text-muted-foreground">Genuine</span>
        <Cell tag="TN" label="correctly allowed" value={m.tn} total={total} />
        <Cell tag="FP" label="false alarm" value={m.fp} total={total} />
        <span className="self-center text-xs text-muted-foreground">Scam</span>
        <Cell tag="FN" label="scam missed" value={m.fn} total={total} />
        <Cell tag="TP" label="scam caught" value={m.tp} total={total} />
      </div>
    </figure>
  );
}

export function ScenarioTable({ ev }: { ev: Evaluation }) {
  const rows = [...ev.per_scenario].sort((a, b) => Number(b.is_fraud) - Number(a.is_fraud) || b.count - a.count);
  return (
    <DataTable
      caption="Detection by scenario"
      rowKey={(r) => r.scenario}
      rows={rows}
      columns={[
        {
          header: "Scenario",
          cell: (r) => (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              {scenarioName(r.scenario)}
              <Badge variant="outline">{r.is_fraud ? "scam · catch rate" : "genuine · false alarms"}</Badge>
            </span>
          ),
        },
        { header: "Payments", numeric: true, cell: (r) => r.count.toLocaleString("en-IN") },
        ...SYSTEMS.map((s) => ({
          header: <SeriesName color={s.color}>{s.short}</SeriesName>,
          numeric: true,
          cell: (r: (typeof rows)[number]) => pct(r[s.key], r.is_fraud ? 1 : 2),
        })),
      ]}
    />
  );
}
