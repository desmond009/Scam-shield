import { CheckCircle2, CircleDot, RotateCw, XCircle } from "lucide-react";
import type { AdminMetrics, BreakerState } from "@/lib/types";
import { cn } from "@/lib/utils";

function ServiceTile({ name, up, detail }: { name: string; up: boolean; detail?: string | null }) {
  const Icon = up ? CheckCircle2 : XCircle;
  return (
    <div className={cn("rounded-lg border border-border px-4 py-3", up ? "bg-surface" : "bg-critical-soft")}>
      <p className="text-xs text-muted-foreground">{name}</p>
      <p className={cn("mt-1 inline-flex items-center gap-1.5 text-lg font-semibold", up ? "text-good" : "text-critical")}>
        <Icon className="size-5" aria-hidden />
        {up ? "Up" : "Down"}
      </p>
      {detail && <p className="truncate text-xs text-subtle" title={detail}>{detail}</p>}
    </div>
  );
}

export function ServiceTiles({ services }: { services: AdminMetrics["services"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <ServiceTile name="API" up={services.api} />
      <ServiceTile name="Postgres" up={services.postgres} />
      <ServiceTile name="Redis" up={services.redis} />
      <ServiceTile name="ML service" up={services.ml} detail={services.mlModelVersion ? `Model ${services.mlModelVersion}` : "No model loaded"} />
      <ServiceTile name="Worker" up={services.worker} detail={services.worker ? "Reporting" : "No report in 90 s"} />
    </div>
  );
}

const BREAKER: Record<BreakerState, { label: string; text: string; tone: "good" | "warning" | "critical"; Icon: typeof CircleDot }> = {
  closed: {
    label: "Closed",
    text: "Healthy: every payment is scored by both the rules and the ML model.",
    tone: "good",
    Icon: CheckCircle2,
  },
  "half-open": {
    label: "Half-open",
    text: "Recovering: the next payment will try the ML service again to check it is back.",
    tone: "warning",
    Icon: RotateCw,
  },
  open: {
    label: "Open",
    text: "The ML service failed repeatedly, so payments are scored by rules only until it recovers.",
    tone: "critical",
    Icon: XCircle,
  },
};

const TONE = { good: "bg-good-soft text-good", warning: "bg-warning-soft text-warning", critical: "bg-critical-soft text-critical" };

export function BreakerStatus({ state }: { state: BreakerState }) {
  const b = BREAKER[state];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium", TONE[b.tone])}>
        <b.Icon className="size-4" aria-hidden />
        {b.label}
      </span>
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{b.text}</p>
    </div>
  );
}
