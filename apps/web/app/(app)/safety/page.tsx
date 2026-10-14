"use client";

import { useQuery } from "@tanstack/react-query";
import { Ban, Clock, Flag, KeyRound, PhoneOff, QrCode, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { BandBadge } from "@/components/band-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { formatDateTime, formatINR } from "@/lib/format";
import type { Safety } from "@/lib/types";

const TIPS = [
  { icon: KeyRound, title: "Never share an OTP or PIN", text: "Banks, police and delivery agents never ask for them. Anyone who asks is a scammer." },
  { icon: QrCode, title: "You never pay to receive money", text: "Scanning a QR code or entering your PIN always sends money out of your account." },
  { icon: PhoneOff, title: "Hang up on urgency", text: "\"Your account will be blocked today\" is pressure. Call your bank on the number printed on your card." },
  { icon: Ban, title: "Don't install apps on request", text: "Screen-sharing apps like AnyDesk let scammers watch your screen and drain your account." },
  { icon: Clock, title: "Too good to be true?", text: "Lottery wins, part-time 'task' jobs and refunds that need a fee first are classic scams." },
];

const STATUS_LABEL = { COMPLETED: "Paid anyway", CANCELLED: "Cancelled", BLOCKED: "Stopped", PENDING: "Not sent" } as const;

export default function SafetyPage() {
  const q = useQuery({ queryKey: ["safety"], queryFn: () => api<Safety>("/safety") });

  return (
    <>
      <PageHeader title="My safety" description="Warnings you received, accounts you reported, and how to spot scams." />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Warnings you received</CardTitle>
              <CardDescription>Payments ScamShield flagged before money moved.</CardDescription>
            </CardHeader>
            <CardContent>
              {q.isLoading && <Skeleton className="h-32 w-full" />}
              {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
              {q.data &&
                (q.data.warnings.length ? (
                  <ul className="divide-y divide-border">
                    {q.data.warnings.map((w) => (
                      <li key={w.transactionId} className="flex flex-wrap items-start justify-between gap-2 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {formatINR(w.amount)} to {w.payeeUpiId}
                          </p>
                          {w.topReason && <p className="text-sm text-muted-foreground">{w.topReason}</p>}
                          <p className="text-xs text-subtle">{formatDateTime(w.createdAt)}</p>
                        </div>
                        <div className="flex gap-1">
                          <BandBadge band={w.band} />
                          <Badge variant="outline">{STATUS_LABEL[w.status]}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No warnings yet" icon={<ShieldCheck className="size-8" />}>
                    All your payments so far looked normal.
                  </EmptyState>
                ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Accounts you reported</CardTitle>
            </CardHeader>
            <CardContent>
              {q.data &&
                (q.data.reports.length ? (
                  <ul className="divide-y divide-border">
                    {q.data.reports.map((r) => (
                      <li key={r.payeeUpiId} className="flex items-start gap-2 py-3 text-sm">
                        <Flag className="mt-0.5 size-4 text-critical" aria-hidden />
                        <span>
                          <span className="font-medium">{r.payeeUpiId}</span>
                          <span className="block text-muted-foreground">{r.reason}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="Nothing reported">Use &ldquo;Cancel and report&rdquo; on a warning to flag a suspicious account.</EmptyState>
                ))}
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>How to spot scams</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {TIPS.map((t) => (
                <li key={t.title} className="flex gap-3">
                  <t.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{t.title}</span>
                    <span className="text-sm text-muted-foreground">{t.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-muted-foreground">
              Lost money? In India, call the cybercrime helpline 1930 or report at cybercrime.gov.in as soon as possible.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
