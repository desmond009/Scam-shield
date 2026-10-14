import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, pct } from "@/lib/format";
import type { ModelInfo, RetrainJob, TrainStatusName } from "@/lib/types";

const STATUS: Record<TrainStatusName, string> = {
  idle: "Idle",
  training: "Training the model…",
  evaluating: "Evaluating on the holdout…",
  completed: "Completed",
  failed: "Failed",
};

const ACTIVE_STATES = new Set(["training", "evaluating"]);
const DONE_JOB_STATES = new Set(["completed", "failed"]);

export const isTraining = (info: ModelInfo | undefined) => !!info?.training && ACTIVE_STATES.has(info.training.status);
export const jobDone = (job: RetrainJob | undefined) => !!job && DONE_JOB_STATES.has(job.state);

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

const jobProgress = (j: RetrainJob) => (typeof j.progress === "object" && j.progress?.status ? j.progress.status : null);

function JobStateIcon({ state }: { state: string }) {
  if (state === "completed") return <CheckCircle2 aria-hidden />;
  if (state === "failed") return <XCircle aria-hidden />;
  return <Loader2 className="animate-spin" aria-hidden />;
}

export function ModelOverview({ info, onRetrain, retraining, polling }: { info: ModelInfo; onRetrain: () => void; retraining: boolean; polling: boolean }) {
  const m = info.liveMetrics ?? info.active?.metrics?.training ?? null;
  const version = info.active?.version ?? info.servingVersion;
  const busy = retraining || polling;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Active model</p>
          <p className="break-all font-mono text-lg font-semibold">{version ?? "No model registered"}</p>
          {info.servingVersion && info.active && info.servingVersion !== info.active.version && (
            <p className="text-xs text-muted-foreground">The ML service is serving {info.servingVersion}; it will be registered after the next sync.</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={onRetrain} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            {busy ? "Retraining…" : "Retrain model"}
          </Button>
          <p className="max-w-64 text-right text-xs text-subtle">Retrains on the synthetic dataset plus every alert an analyst has labelled.</p>
        </div>
      </div>

      {m ? (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Trained">{formatDateTime(m.trained_at)}</Fact>
          <Fact label="Algorithm">{m.algorithm}</Fact>
          <Fact label="Rows (train / calibration / test)">
            {m.rows.train.toLocaleString("en-IN")} / {m.rows.calibration.toLocaleString("en-IN")} / {m.rows.test.toLocaleString("en-IN")}
          </Fact>
          <Fact label="Analyst labels used">{m.rows.analyst_labels.toLocaleString("en-IN")}</Fact>
          <Fact label="Fraud rate (train / calibration / test)">
            {pct(m.fraud_rate.train, 2)} / {pct(m.fraud_rate.calibration, 2)} / {pct(m.fraud_rate.test, 2)}
          </Fact>
          <Fact label="Training time">{m.train_seconds} s</Fact>
          <div className="col-span-2">
            <Fact label="Split">{m.split}</Fact>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Training details are unavailable while the ML service is unreachable.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Training status</p>
          {info.training ? (
            <p className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
              <Badge variant={isTraining(info) ? "primary" : "outline"}>
                {isTraining(info) && <Loader2 className="animate-spin" aria-hidden />}
                {STATUS[info.training.status] ?? info.training.status}
              </Badge>
              {info.training.version && <span className="font-mono text-xs text-muted-foreground">{info.training.version}</span>}
              {info.training.finishedAt && <span className="text-xs text-subtle">finished {formatDateTime(new Date(info.training.finishedAt * 1000))}</span>}
              {info.training.error && <span className="text-xs text-critical">{info.training.error}</span>}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">ML service unreachable.</p>
          )}
          {info.recentJobs.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {info.recentJobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    <JobStateIcon state={j.state} />
                    {j.state}
                  </Badge>
                  {jobProgress(j) && <span>{jobProgress(j)}</span>}
                  <span className="text-subtle">{formatDateTime(new Date(j.timestamp))}</span>
                  {j.failedReason && <span className="text-critical">{j.failedReason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Model history</p>
          {info.history.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {info.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="break-all font-mono text-xs">{h.version}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {formatDateTime(h.trainedAt)}
                    {h.active && <Badge variant="primary">active</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No models registered yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
