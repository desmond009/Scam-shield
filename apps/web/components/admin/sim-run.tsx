import { ArrowRight, Ban, CheckCircle2, Clock, Hand, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { BandBadge } from "@/components/band-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import type { SimRun, SimStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { featureName } from "./labels";

const OUTCOME: Record<SimStep["outcome"], { label: string; Icon: typeof CheckCircle2 }> = {
  completed: { label: "Payment completed", Icon: CheckCircle2 },
  stopped: { label: "Victim stopped", Icon: Hand },
  rescored: { label: "Re-scored after questions", Icon: RefreshCw },
};

export interface LoggedRun {
  id: number;
  ranAt: Date;
  result: SimRun;
}

/** Band per step, left to right, so escalation (e.g. LOW, LOW, then MEDIUM) is visible at a glance. */
function StepStrip({ steps }: { steps: SimStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Risk band at each step">
      {steps.map((s, i) => {
        const escalated = i > 0 && s.band !== steps[i - 1].band;
        return (
          <li key={s.step} className="flex items-center gap-1.5">
            {i > 0 && <ArrowRight className={cn("size-3.5", escalated ? "text-foreground" : "text-subtle")} aria-hidden />}
            <span className={cn("flex items-center gap-1 rounded-full", escalated && "ring-2 ring-ring ring-offset-1 ring-offset-surface")}>
              <span className="tabular pl-1 text-xs text-subtle">{s.step}</span>
              <BandBadge band={s.band} score={s.score} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Score({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular flex items-center gap-1.5 font-medium">
        {value}
        {children}
      </dd>
    </div>
  );
}

function StepRow({ s }: { s: SimStep }) {
  const outcome = OUTCOME[s.outcome];
  const mlMissing = s.degraded || s.mlScore == null;
  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm">
            <span className="tabular mr-2 text-subtle">#{s.step}</span>
            <span className="font-medium">{s.actor}</span> · {s.action}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            {formatINR(s.amount)} to {s.payeeUpiId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <BandBadge band={s.band} score={s.score} />
          <Badge variant="outline">
            <outcome.Icon aria-hidden />
            {outcome.label}
          </Badge>
          {s.blocked && (
            <Badge variant="critical">
              <Ban aria-hidden />
              Blocked
            </Badge>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3 text-sm sm:grid-cols-5">
        <Score label="Final score" value={String(Math.round(s.score))} />
        <Score label="Rule score" value={String(Math.round(s.ruleScore))} />
        <Score label="ML score" value={mlMissing ? "—" : String(Math.round(s.mlScore!))}>
          {mlMissing && <Badge variant="outline">rules only</Badge>}
        </Score>
        <Score label="Before questions" value={s.preContextScore == null ? "—" : String(Math.round(s.preContextScore))} />
        <Score label="Latency" value={`${s.latencyMs} ms`}>
          <Clock className="size-3.5 text-subtle" aria-hidden />
        </Score>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Rules that fired</p>
          {s.reasons.length ? (
            <ul className="space-y-1">
              {s.reasons.map((r) => (
                <li key={r.code} className="flex items-baseline justify-between gap-2 text-sm">
                  <span title={r.detail}>{r.title}</span>
                  <span className="tabular shrink-0 text-muted-foreground">+{r.points} pts</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">None</p>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">ML top features</p>
          {s.mlTopFeatures?.length ? (
            <ul className="space-y-1">
              {s.mlTopFeatures.map((f) => (
                <li key={f.feature} className="flex items-baseline justify-between gap-2 text-sm">
                  <span>
                    {featureName(f.feature)} <span className="tabular text-xs text-subtle">= {+f.value.toFixed(2)}</span>
                  </span>
                  <span className="tabular shrink-0 text-muted-foreground">+{(f.contribution * 100).toFixed(1)} pts</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">{mlMissing ? "ML unavailable for this payment" : "No feature stood out"}</p>
          )}
        </div>
      </div>
    </li>
  );
}

export function SimRunCard({ run }: { run: LoggedRun }) {
  const { result } = run;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{result.title}</CardTitle>
            <CardDescription>
              {run.ranAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} ·{" "}
              {result.steps.length} {result.steps.length === 1 ? "payment" : "payments"}
            </CardDescription>
          </div>
          {result.finalBand && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Final
              <BandBadge band={result.finalBand} />
            </span>
          )}
        </div>
        <div className="pt-2">
          <StepStrip steps={result.steps} />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {result.steps.map((s) => (
            <StepRow key={s.step} s={s} />
          ))}
        </ul>
        <p className="mt-3 text-xs text-subtle">ML feature points = how much the model&apos;s fraud probability drops when that feature is set to a typical legitimate value.</p>
      </CardContent>
    </Card>
  );
}
