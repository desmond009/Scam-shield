"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { BreakerStatus, ServiceTiles } from "@/components/admin/service-status";
import { LatencyChart } from "@/components/admin/latency-chart";
import { QueueTable } from "@/components/admin/queue-table";
import { StatTile } from "@/components/admin/stat-tile";
import { PageHeader, RoleGate } from "@/components/app-shell";
import { BandBadge } from "@/components/band-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { AdminMetrics, Band } from "@/lib/types";

const BANDS: Band[] = ["LOW", "MEDIUM", "HIGH"];

const ms = (v: number | null) => (v == null ? "—" : `${Math.round(v)} ms`);
const num = (v: number) => v.toLocaleString("en-IN");

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function HealthDashboard({ m }: { m: AdminMetrics }) {
  const s = m.summary;
  return (
    <div className="space-y-4">
      <Section title="Services">
        <ServiceTiles services={m.services} />
      </Section>

      <Section title="ML circuit breaker" description="Stops calling the ML service after repeated failures so payments are never held up.">
        <BreakerStatus state={m.ml.breaker} />
      </Section>

      <Section title="Decisions by risk band" description="All payments scored since the counters were last reset.">
        <div className="grid gap-3 sm:grid-cols-3">
          {BANDS.map((band) => (
            <StatTile key={band} label={<BandBadge band={band} />} value={num(m.decisionsByBand[band])} />
          ))}
        </div>
      </Section>

      <Section title="Decision latency" description={`Time to score a payment, from the last ${num(m.latency.samples)} decisions.`}>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Median (p50)" value={ms(m.latency.p50)} />
          <StatTile label="p95" value={ms(m.latency.p95)} />
          <StatTile label="p99" value={ms(m.latency.p99)} />
        </div>
        <h4 className="mb-2 mt-5 text-sm font-medium">Decisions per latency bucket</h4>
        {m.latency.histogram.some((h) => h.count > 0) ? (
          <LatencyChart histogram={m.latency.histogram} />
        ) : (
          <EmptyState title="No decisions yet">Send a payment or run a Simulator scenario to see latency.</EmptyState>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="ML service calls" description="Fallbacks are payments scored by rules only.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Calls" value={num(m.ml.calls)} />
            <StatTile label="Succeeded" value={num(m.ml.ok)} />
            <StatTile label="Fallbacks" value={num(m.ml.fallbacks)} />
            <StatTile label="Timeouts" value={num(m.ml.timeouts)} />
            <StatTile label="Errors" value={num(m.ml.errors)} />
            <StatTile label="Skipped (breaker open)" value={num(m.ml.breakerOpenSkips)} />
          </div>
        </Section>

        <Section title="Background queues" description="Jobs waiting for the worker.">
          <QueueTable
            queues={[
              { name: "Risk events", counts: m.queue.riskEvents },
              { name: "Model training", counts: m.queue.model },
            ]}
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatTile label="Live alert feeds" value={num(m.liveClients)} hint="Analyst consoles connected now" />
          </div>
        </Section>
      </div>

      <Section
        title="Worker summary, last 24 hours"
        description={s ? `Updated ${timeAgo(s.generatedAt)} (${formatDateTime(s.generatedAt)})` : undefined}
      >
        {s ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {BANDS.map((band) => (
              <StatTile key={band} label={<BandBadge band={band} />} value={num(s.last24h.byBand[band] ?? 0)} />
            ))}
            <StatTile label="Rules only" value={num(s.last24h.degraded)} hint="Scored without ML" />
            <StatTile label="Avg. latency" value={ms(s.last24h.avgDecisionLatencyMs)} />
            <StatTile label="Last hour" value={num(s.decisionsLastHour)} hint="Decisions" />
            <StatTile label="Open alerts" value={num(s.openAlerts)} />
          </div>
        ) : (
          <EmptyState title="No worker summary">The worker has not reported in the last 90 seconds. Check that it is running.</EmptyState>
        )}
      </Section>
    </div>
  );
}

export default function HealthPage() {
  const q = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: () => api<AdminMetrics>("/admin/metrics"),
    refetchInterval: 5_000,
  });

  return (
    <RoleGate roles={["ADMIN"]}>
      <PageHeader
        title="System health"
        description={q.dataUpdatedAt ? `Refreshes every 5 seconds · last updated ${new Date(q.dataUpdatedAt).toLocaleTimeString("en-IN")}` : "Refreshes every 5 seconds"}
      />
      {q.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}
      {q.isError && !q.data && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isError && q.data && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          Couldn&apos;t refresh ({errorMessage(q.error)}). Showing the last known values.
        </p>
      )}
      {q.data && <HealthDashboard m={q.data} />}
    </RoleGate>
  );
}
