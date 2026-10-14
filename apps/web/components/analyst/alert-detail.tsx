"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatINR } from "@/lib/format";
import type { AlertDetail as AlertDetailData } from "@/lib/types";
import { BandBadge } from "../band-badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { ErrorState } from "../ui/states";
import { AlertFlags } from "./alert-flags";
import { FeatureTable, MlFeaturesPanel } from "./features-panel";
import { PayeePanel } from "./payee-panel";
import { ReasonsPanel } from "./reasons-panel";
import { ReviewPanel } from "./review-panel";
import { ScoreBreakdown } from "./score-breakdown";

function Header({ alert }: { alert: AlertDetailData }) {
  return (
    <div className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <BandBadge band={alert.band} score={alert.score} />
        <AlertFlags alert={alert} showOutcome={false} />
        <span className="ml-auto text-xs text-subtle">{formatDateTime(alert.createdAt)}</span>
      </div>
      <p className="tabular text-3xl font-semibold tracking-tight">{formatINR(alert.amount)}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">From</dt>
          <dd className="font-medium">{alert.user.name}</dd>
          <dd className="break-all text-muted-foreground">
            {alert.user.upiId} · account {alert.user.accountAgeDays} d old
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">To</dt>
          <dd className="font-medium">{alert.payee.displayName ?? "Unknown payee"}</dd>
          <dd className="break-all text-muted-foreground">{alert.payeeUpiId}</dd>
        </div>
      </dl>
      <p className="text-xs text-subtle">
        Payment status: {alert.transactionStatus.toLowerCase()} · ID <span className="font-mono">{alert.transactionId}</span>
      </p>
    </div>
  );
}

export function AlertDetailPane({ id, onBack }: { id: string; onBack: () => void }) {
  const q = useQuery({ queryKey: ["alert", id], queryFn: () => api<AlertDetailData>(`/alerts/${id}`) });

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-3 py-2 lg:hidden">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Back to alerts
        </Button>
      </div>
      {q.isLoading && (
        <div className="space-y-3 p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <Header alert={q.data} />
          <ReviewPanel key={q.data.id} alert={q.data} />
          <ScoreBreakdown alert={q.data} />
          <ReasonsPanel reasons={q.data.reasons} />
          <MlFeaturesPanel features={q.data.mlTopFeatures} />
          <PayeePanel payee={q.data.payee} />
          <FeatureTable features={q.data.features} />
        </>
      )}
    </Card>
  );
}
