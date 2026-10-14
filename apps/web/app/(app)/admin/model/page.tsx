"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Table2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CalibrationChart } from "@/components/admin/calibration-chart";
import { ConfusionMatrix, Headline, ScenarioTable, SystemComparison } from "@/components/admin/eval-tables";
import { ImportanceChart } from "@/components/admin/importance-chart";
import { isTraining, jobDone, ModelOverview } from "@/components/admin/model-overview";
import { PrCurveChart } from "@/components/admin/pr-curve-chart";
import { SweepChart } from "@/components/admin/sweep-chart";
import { PageHeader, RoleGate } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { pct } from "@/lib/format";
import type { Evaluation, ModelInfo } from "@/lib/types";

const MODEL_KEY = ["admin", "model"];
const EVAL_KEY = ["admin", "evaluation"];
const POLL_MS = 3_000;

export default function ModelPage() {
  return (
    <RoleGate roles={["ADMIN"]}>
      <ModelEvaluation />
    </RoleGate>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ModelEvaluation() {
  const qc = useQueryClient();
  const [trackedJob, setTrackedJob] = useState<string | null>(null);
  const [showTables, setShowTables] = useState(false);

  const model = useQuery({
    queryKey: MODEL_KEY,
    queryFn: () => api<ModelInfo>("/admin/model"),
    refetchInterval: (q) => {
      const info = q.state.data;
      if (isTraining(info)) return POLL_MS;
      if (trackedJob && !jobDone(info?.recentJobs.find((j) => j.id === trackedJob))) return POLL_MS;
      return false;
    },
  });
  const evaluation = useQuery({ queryKey: EVAL_KEY, queryFn: () => api<Evaluation>("/admin/evaluation"), retry: 1 });

  const retrain = useMutation({
    mutationFn: () => api<{ jobId: string; status: string }>("/admin/model/retrain", { method: "POST" }),
    onSuccess: ({ jobId }) => {
      setTrackedJob(jobId);
      toast.success("Retraining started. This page updates every few seconds.");
      qc.invalidateQueries({ queryKey: MODEL_KEY });
    },
    onError: (e) => toast.error(`Couldn't start retraining: ${errorMessage(e)}`),
  });

  const tracked = trackedJob ? model.data?.recentJobs.find((j) => j.id === trackedJob) : undefined;
  useEffect(() => {
    if (!tracked || !jobDone(tracked)) return;
    if (tracked.state === "completed") {
      toast.success("New model trained, evaluated and activated.");
      qc.invalidateQueries({ queryKey: EVAL_KEY });
    } else {
      toast.error(`Retraining failed${tracked.failedReason ? `: ${tracked.failedReason}` : ""}`);
    }
    setTrackedJob(null);
  }, [tracked, qc]);

  const polling = isTraining(model.data) || (!!trackedJob && !jobDone(tracked));
  const ev = evaluation.data;

  return (
    <>
      <PageHeader title="Model & evaluation" description="How the rules, the ML model and the hybrid compare on payments none of them saw in training." />

      <div className="space-y-4">
        <Card>
          <CardContent className="pt-5">
            {model.isLoading && <Skeleton className="h-48 w-full" />}
            {model.isError && <ErrorState error={model.error} onRetry={() => model.refetch()} />}
            {model.data && <ModelOverview info={model.data} onRetrain={() => retrain.mutate()} retraining={retrain.isPending} polling={polling} />}
          </CardContent>
        </Card>

        {evaluation.isLoading && <Skeleton className="h-64 w-full" />}
        {evaluation.isError && (
          <Card>
            <ErrorState error={evaluation.error} onRetry={() => evaluation.refetch()} />
          </Card>
        )}

        {ev && (
          <>
            <Section
              title="Does the hybrid beat rules alone?"
              description={
                <>
                  Holdout: {ev.holdout.rows.toLocaleString("en-IN")} payments, {ev.holdout.fraud.toLocaleString("en-IN")} scams ({pct(ev.holdout.fraud_rate, 2)}). Model{" "}
                  <span className="font-mono">{ev.version}</span>, evaluated at thresholds {ev.thresholds.mediumThreshold} / {ev.thresholds.highThreshold}.
                </>
              }
            >
              <Headline ev={ev} />
            </Section>

            <Section title="Side by side" description="A payment counts as flagged when its score reaches the threshold.">
              <SystemComparison ev={ev} />
            </Section>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowTables((v) => !v)} aria-pressed={showTables}>
                <Table2 aria-hidden />
                {showTables ? "Hide data tables" : "Show data tables"}
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Precision vs recall" description="Higher and further right is better: more scams caught with fewer false alarms.">
                <PrCurveChart ev={ev} showTable={showTables} />
              </Section>
              <Section title="Threshold sweep" description="How precision, recall and false-positive rate move as the score threshold rises.">
                <SweepChart ev={ev} showTable={showTables} />
              </Section>
              <Section title="Calibration" description="Does an ML score of 80 mean roughly 80% of such payments are scams?">
                <CalibrationChart ev={ev} showTable={showTables} />
              </Section>
              <Section title="What the model relies on" description="Top 12 features by permutation importance: the drop in PR-AUC when a feature is shuffled.">
                <ImportanceChart ev={ev} showTable={showTables} />
              </Section>
            </div>

            <Section title="Confusion matrices" description={`Counts on the holdout at the medium threshold (score ≥ ${ev.thresholds.mediumThreshold}).`}>
              <div className="grid gap-6 md:grid-cols-2">
                <ConfusionMatrix ev={ev} system="hybrid" />
                <ConfusionMatrix ev={ev} system="rules_only" />
              </div>
            </Section>

            <Section title="Detection by scenario" description="Scam scenarios show the share caught; genuine scenarios show the share wrongly flagged (at the medium threshold).">
              <ScenarioTable ev={ev} />
            </Section>

            <Card className="border-dashed">
              <CardContent className="pt-5">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Info className="size-4 text-primary" aria-hidden />
                  Read these numbers with care
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {ev.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
