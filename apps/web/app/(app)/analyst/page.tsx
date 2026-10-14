"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MousePointerClick, ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AlertDetailPane } from "@/components/analyst/alert-detail";
import { AlertFilters, type AlertFilterState } from "@/components/analyst/alert-filters";
import { AlertList } from "@/components/analyst/alert-list";
import { LiveIndicator } from "@/components/analyst/live-indicator";
import { useAlertStream } from "@/components/analyst/use-alert-stream";
import { PageHeader, RoleGate } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import type { AlertList as AlertListData } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function alertsPath({ status, band, page }: AlertFilterState) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status !== "ALL") params.set("status", status);
  if (band !== "ALL") params.set("band", band);
  return `/alerts?${params}`;
}

function AnalystConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = useSearchParams().get("id");
  const [filters, setFilters] = useState<AlertFilterState>({ status: "OPEN", band: "ALL", page: 1 });
  const { status: streamStatus, freshIds } = useAlertStream();

  const alerts = useQuery({
    queryKey: ["alerts", filters],
    queryFn: () => api<AlertListData>(alertsPath(filters)),
    placeholderData: keepPreviousData,
  });

  const select = (id: string | null) => router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false });
  const totalPages = alerts.data ? Math.ceil(alerts.data.total / PAGE_SIZE) : 1;

  return (
    <>
      <PageHeader
        title="Alerts"
        description={
          alerts.data
            ? `${alerts.data.openCount} open ${alerts.data.openCount === 1 ? "alert" : "alerts"} waiting for review`
            : "Medium and high risk payments waiting for review"
        }
        actions={<LiveIndicator status={streamStatus} />}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={cn("min-w-0 space-y-3", selectedId && "hidden lg:block")}>
          <AlertFilters value={filters} onChange={setFilters} totalPages={totalPages} />
          <Card className="overflow-hidden">
            {alerts.isLoading && (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            )}
            {alerts.isError && <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} />}
            {alerts.data &&
              (alerts.data.items.length ? (
                <AlertList items={alerts.data.items} selectedId={selectedId} freshIds={freshIds} onSelect={select} />
              ) : (
                <EmptyState title="No alerts" icon={<ShieldCheck className="size-8" />}>
                  Nothing matches these filters. Run a scenario in the Simulator to generate risky payments.
                </EmptyState>
              ))}
          </Card>
          {alerts.data && alerts.data.total > 0 && (
            <p className="text-xs text-subtle">
              {alerts.data.total} {alerts.data.total === 1 ? "alert" : "alerts"} match these filters.
            </p>
          )}
        </div>
        <div className={cn("min-w-0", !selectedId && "hidden lg:block")}>
          {selectedId ? (
            <AlertDetailPane id={selectedId} onBack={() => select(null)} />
          ) : (
            <Card>
              <EmptyState title="Select an alert" icon={<MousePointerClick className="size-8" />}>
                Pick an alert from the queue to see why it was flagged and record your verdict.
              </EmptyState>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function AnalystPage() {
  return (
    <RoleGate roles={["ANALYST"]}>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AnalystConsole />
      </Suspense>
    </RoleGate>
  );
}
