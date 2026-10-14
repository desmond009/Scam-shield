"use client";

import { upiIdSchema } from "@scamshield/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CircleSlash, Info, Loader2, PhoneCall, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BAND_META } from "@/components/band-badge";
import { RiskMeter } from "@/components/risk-meter";
import { HighRiskDialog } from "@/components/send/high-risk-dialog";
import { PayeeCard } from "@/components/send/payee-card";
import { Questionnaire, type Answers } from "@/components/send/questionnaire";
import { ReasonsList } from "@/components/send/reasons-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { ConfirmResult, Decision, Page, PayeeLookup, TxnItem } from "@/lib/types";

type Stage = "recipient" | "amount" | "decision" | "done" | "cancelled";
type Busy = "pay" | "cancel" | "report" | "context" | null;

const MIN_SCAN_MS = 700;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function SendMoneyPage() {
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>("recipient");
  const [upi, setUpi] = useState("");
  const [upiError, setUpiError] = useState<string | null>(null);
  const [payee, setPayee] = useState<PayeeLookup | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [cancelled, setCancelled] = useState<{ reported: boolean } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const idemKey = useRef<string | null>(null);

  const recent = useQuery({
    queryKey: ["transactions", "recent-payees"],
    queryFn: () => api<Page<TxnItem>>("/transactions?pageSize=30&status=COMPLETED"),
  });
  const recentPayees = [...new Map((recent.data?.items ?? []).map((t) => [t.payeeUpiId, t])).values()].slice(0, 6);

  const lookup = useMutation({
    mutationFn: (id: string) => api<PayeeLookup>(`/payees/lookup?upi=${encodeURIComponent(id)}`),
    onSuccess: (p) => {
      setPayee(p);
      setStage("amount");
    },
  });

  const check = useMutation({
    mutationFn: async () => {
      idemKey.current ??= crypto.randomUUID();
      const [d] = await Promise.all([
        api<Decision>("/payments/check", {
          method: "POST",
          body: { payeeUpiId: payee!.upiId, amount: Number(amount), ...(note.trim() && { note: note.trim() }) },
          headers: { "Idempotency-Key": idemKey.current },
        }),
        wait(MIN_SCAN_MS), // long enough for the person to see that a check happened
      ]);
      return d;
    },
    onSuccess: (d) => {
      idemKey.current = null;
      setDecision(d);
      setStage("decision");
      if (d.band === "LOW" && d.checkToken) void pay(d, undefined);
    },
  });

  function finish() {
    void qc.invalidateQueries({ queryKey: ["wallet"] });
    void qc.invalidateQueries({ queryKey: ["transactions"] });
    void qc.invalidateQueries({ queryKey: ["safety"] });
  }

  async function pay(d: Decision, retypedUpiId: string | undefined) {
    setBusy("pay");
    try {
      const r = await api<ConfirmResult>("/payments/confirm", { method: "POST", body: { checkToken: d.checkToken, retypedUpiId } });
      setResult(r);
      setStage("done");
      finish();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(report: boolean) {
    if (!decision) return;
    setBusy(report ? "report" : "cancel");
    try {
      await api(`/payments/${decision.transactionId}/cancel`, {
        method: "POST",
        body: { report, reason: report ? "Reported from the payment warning" : undefined },
      });
      setCancelled({ reported: report });
      setStage("cancelled");
      finish();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function answer(a: Answers) {
    if (!decision) return;
    setBusy("context");
    try {
      setDecision(await api<Decision>(`/payments/${decision.transactionId}/context`, { method: "POST", body: a }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setStage("recipient");
    setUpi("");
    setPayee(null);
    setAmount("");
    setNote("");
    setDecision(null);
    setResult(null);
    setCancelled(null);
    setVerifyOpen(false);
  }

  function submitRecipient(id: string) {
    const parsed = upiIdSchema.safeParse(id);
    if (!parsed.success) return setUpiError(parsed.error.issues[0].message);
    setUpiError(null);
    lookup.mutate(parsed.data);
  }

  const amountNum = Number(amount);
  const amountValid = amountNum > 0 && amountNum <= 100_000;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center gap-2">
        {stage === "amount" && (
          <Button variant="ghost" size="icon" aria-label="Back" onClick={() => setStage("recipient")}>
            <ArrowLeft />
          </Button>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">Send money</h1>
      </div>

      {stage === "recipient" && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitRecipient(upi);
              }}
            >
              <Label htmlFor="upi">Recipient&apos;s UPI ID</Label>
              <Input id="upi" autoFocus autoComplete="off" spellCheck={false} placeholder="name@bank" value={upi} onChange={(e) => setUpi(e.target.value)} aria-invalid={!!upiError} />
              {(upiError || lookup.isError) && (
                <p role="alert" className="text-sm text-critical">
                  {upiError ?? errorMessage(lookup.error)}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={!upi || lookup.isPending}>
                {lookup.isPending && <Loader2 className="animate-spin" />}
                Continue
              </Button>
            </form>
            {recentPayees.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Recent</p>
                <div className="flex flex-wrap gap-2">
                  {recentPayees.map((t) => (
                    <button
                      key={t.payeeUpiId}
                      type="button"
                      onClick={() => {
                        setUpi(t.payeeUpiId);
                        submitRecipient(t.payeeUpiId);
                      }}
                      className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary hover:bg-primary-soft"
                    >
                      {t.payeeName ?? t.payeeUpiId}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {stage === "amount" && payee && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <PayeeCard payee={payee} />
            {check.isPending ? (
              <div className="py-4">
                <RiskMeter score={0} band="LOW" scanning />
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (amountValid) check.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground">₹</span>
                    <Input
                      id="amount"
                      autoFocus
                      inputMode="decimal"
                      className="h-14 pl-9 text-2xl font-semibold"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    />
                  </div>
                  {amount && !amountValid && <p className="text-xs text-critical">Enter an amount between ₹1 and ₹1,00,000.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="note">Note (optional)</Label>
                  <Input id="note" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is it for?" />
                </div>
                {check.isError && (
                  <p role="alert" className="text-sm text-critical">
                    {errorMessage(check.error)}
                  </p>
                )}
                <Button type="submit" size="lg" className="w-full" disabled={!amountValid}>
                  <ShieldCheck /> Check &amp; pay {amountValid && formatINR(amountNum)}
                </Button>
                <p className="text-center text-xs text-muted-foreground">Every payment is checked for scam signs before any money moves.</p>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {stage === "decision" && decision && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <RiskMeter score={decision.score} band={decision.band} thresholds={decision.thresholds} />
            <p className="text-center text-sm">{decision.summary}</p>
            {decision.degraded && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3.5" aria-hidden /> Checked with safety rules only; the smart model was unavailable.
              </p>
            )}

            {decision.band === "LOW" &&
              (busy === "pay" ? (
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Sending {formatINR(decision.amount)}…
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="secondary" onClick={() => cancel(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => pay(decision, undefined)}>Try again</Button>
                </div>
              ))}

            {decision.band === "MEDIUM" && (
              <div className="space-y-4">
                <ReasonsList reasons={decision.reasons} tone="warning" />
                {decision.preContextScore !== null && (
                  <p className="text-center text-xs text-muted-foreground">
                    Re-checked with your answers: {Math.round(decision.preContextScore)} → {Math.round(decision.score)}
                  </p>
                )}
                {decision.requiresContext && <Questionnaire onSubmit={answer} pending={busy === "context"} />}
                {verifyOpen && payee && (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <PayeeCard payee={payee} />
                    <p className="flex gap-2 text-sm text-muted-foreground">
                      <PhoneCall className="mt-0.5 size-4 shrink-0" aria-hidden />
                      Call the person on a number you already have (not one sent in a message) and confirm the UPI ID and amount.
                    </p>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button variant="outline" onClick={() => setVerifyOpen((v) => !v)}>
                    Verify recipient
                  </Button>
                  <Button disabled={!!busy} onClick={() => cancel(false)}>
                    {busy === "cancel" && <Loader2 className="animate-spin" />}
                    Cancel payment
                  </Button>
                  <Button variant="outline" disabled={!!busy} onClick={() => pay(decision, undefined)}>
                    {busy === "pay" && <Loader2 className="animate-spin" />}
                    Continue anyway
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {stage === "decision" && decision?.band === "HIGH" && (
        <HighRiskDialog decision={decision} busy={busy} onCancel={cancel} onAnswer={answer} onPay={(retyped) => pay(decision, retyped)} />
      )}

      {stage === "done" && result && decision && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="size-14 text-good" aria-hidden />
            <p className="text-2xl font-semibold">{formatINR(result.amount)} sent</p>
            <p className="text-sm text-muted-foreground">to {payee?.displayName ?? result.payeeUpiId}</p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {(() => {
                const { Icon, label } = BAND_META[decision.band];
                return (
                  <>
                    <Icon className="size-3.5" aria-hidden /> Risk check: {label.toLowerCase()} ({Math.round(decision.score)}/100)
                  </>
                );
              })()}
            </p>
            <p className="text-sm">New balance: {formatINR(result.balance)}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={reset}>
                Send another
              </Button>
              <Button asChild>
                <Link href="/wallet">Back to wallet</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "cancelled" && cancelled && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CircleSlash className="size-14 text-muted-foreground" aria-hidden />
            <p className="text-2xl font-semibold">Payment cancelled</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              No money was sent.{" "}
              {cancelled.reported ? "Thank you for reporting this account. It helps protect other people." : "Good call taking a second look."}
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={reset}>
                New payment
              </Button>
              <Button asChild>
                <Link href="/safety">How to spot scams</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
