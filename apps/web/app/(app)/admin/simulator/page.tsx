"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { type LoggedRun, SimRunCard } from "@/components/admin/sim-run";
import { PageHeader, RoleGate } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import type { Scenario, SimRun, SimScenario } from "@/lib/types";

export default function SimulatorPage() {
  return (
    <RoleGate roles={["ADMIN"]}>
      <Simulator />
    </RoleGate>
  );
}

function Simulator() {
  const scenarios = useQuery({ queryKey: ["admin", "scenarios"], queryFn: () => api<{ scenarios: SimScenario[] }>("/admin/simulate") });
  const [runs, setRuns] = useState<LoggedRun[]>([]);
  const nextId = useRef(1);

  const run = useMutation({
    mutationFn: (id: Scenario) => api<SimRun>(`/admin/simulate/${id}`, { method: "POST" }),
    onSuccess: (result) => setRuns((prev) => [{ id: nextId.current++, ranAt: new Date(), result }, ...prev]),
    onError: (e) => toast.error(`Scenario failed: ${errorMessage(e)}`),
  });
  const running = run.isPending ? run.variables : null;

  return (
    <>
      <PageHeader
        title="Scam simulator"
        description="Replay real scam patterns against the live risk engine and watch each payment get scored."
      />

      <p className="mb-4 rounded-lg border border-border bg-primary-soft px-4 py-3 text-sm text-foreground">
        Simulator payments are synthetic: they run through the same pipeline as real payments and show up in the{" "}
        <Link href="/analyst" className="font-medium text-primary underline-offset-4 hover:underline">
          analyst console
        </Link>{" "}
        as live alerts.
      </p>

      <section aria-labelledby="scenarios-heading" className="mb-8">
        <h2 id="scenarios-heading" className="sr-only">
          Scenarios
        </h2>
        {scenarios.isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        )}
        {scenarios.isError && (
          <Card>
            <ErrorState error={scenarios.error} onRetry={() => scenarios.refetch()} />
          </Card>
        )}
        {scenarios.data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.data.scenarios.map((s) => (
              <Card key={s.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle>{s.title}</CardTitle>
                  <CardDescription>{s.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button
                    className="w-full"
                    onClick={() => run.mutate(s.id)}
                    disabled={run.isPending}
                    aria-label={`Run ${s.title}`}
                  >
                    {running === s.id ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                    {running === s.id ? "Running…" : "Run"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="log-heading">
        <h2 id="log-heading" className="mb-3 text-lg font-semibold">
          Decision log
        </h2>
        <p className="sr-only" role="status">
          {run.isPending ? "Running scenario…" : runs[0] ? `${runs[0].result.title} finished with ${runs[0].result.steps.length} payments.` : ""}
        </p>
        {runs.length === 0 && !run.isPending ? (
          <Card>
            <EmptyState title="No runs yet" icon={<FlaskConical className="size-8" />}>
              Run a scenario above. Each payment&apos;s score, band, and reasons will appear here, newest first.
            </EmptyState>
          </Card>
        ) : (
          <div className="space-y-4">
            {run.isPending && <Skeleton className="h-48 w-full" />}
            {runs.map((r) => (
              <SimRunCard key={r.id} run={r} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
