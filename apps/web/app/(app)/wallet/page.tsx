"use client";

import { useQuery } from "@tanstack/react-query";
import { Send, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { SpendingChart } from "@/components/charts/spending-chart";
import { TxnList } from "@/components/txn-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { Page, TxnItem, Wallet } from "@/lib/types";

export default function WalletPage() {
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api<Wallet>("/wallet") });
  const txns = useQuery({ queryKey: ["transactions", 1], queryFn: () => api<Page<TxnItem>>("/transactions?pageSize=8") });

  if (wallet.isError) return <ErrorState error={wallet.error} onRetry={() => wallet.refetch()} />;

  return (
    <>
      <PageHeader title={wallet.data ? `Hi, ${wallet.data.name.split(" ")[0]}` : "Wallet"} description={wallet.data?.upiId} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardDescription>Available balance</CardDescription>
            {wallet.data ? (
              <p className="text-3xl font-semibold tracking-tight">{formatINR(wallet.data.balance)}</p>
            ) : (
              <Skeleton className="h-9 w-40" />
            )}
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button asChild className="flex-1">
              <Link href="/send">
                <Send /> Send money
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/safety">
                <ShieldAlert /> Safety
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Spending, last 30 days</CardTitle>
              <CardDescription>
                {wallet.data
                  ? `${formatINR(wallet.data.last30Days.spent)} across ${wallet.data.last30Days.payments} payments · ${wallet.data.last30Days.warnings} warnings`
                  : "Loading…"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>{wallet.data ? <SpendingChart data={wallet.data.dailySpending} /> : <Skeleton className="h-56 w-full" />}</CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {txns.isLoading && <Skeleton className="h-40 w-full" />}
          {txns.isError && <ErrorState error={txns.error} onRetry={() => txns.refetch()} />}
          {txns.data && (txns.data.items.length ? <TxnList items={txns.data.items} /> : <EmptyState title="No payments yet" />)}
        </CardContent>
      </Card>
    </>
  );
}
