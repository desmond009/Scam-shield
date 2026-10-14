"use client";

import { Flag, Loader2, OctagonX, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import type { Decision } from "@/lib/types";
import { RiskMeter } from "../risk-meter";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Questionnaire, type Answers } from "./questionnaire";
import { ReasonsList } from "./reasons-list";

function useSecondsLeft(endsAt: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000)) : 0;
}

/**
 * Blocking intervention for HIGH risk: cannot be dismissed, makes "Cancel and report" the obvious action, and
 * only allows paying after a cooldown and re-typing the recipient's UPI ID (the server enforces both).
 */
export function HighRiskDialog({
  decision,
  onCancel,
  onPay,
  onAnswer,
  busy,
}: {
  decision: Decision;
  onCancel: (report: boolean) => void;
  onPay: (retypedUpiId: string) => void;
  onAnswer: (a: Answers) => void;
  busy: "pay" | "cancel" | "report" | "context" | null;
}) {
  const left = useSecondsLeft(decision.cooldownEndsAt);
  const [override, setOverride] = useState(false);
  const [retyped, setRetyped] = useState("");
  const matches = retyped.trim().toLowerCase() === decision.payeeUpiId;
  const total = decision.cooldownSeconds || 10;

  return (
    <Dialog open>
      <DialogContent blocking className="border-critical-mark/50 sm:max-w-xl" aria-describedby="high-risk-summary">
        <div className="flex items-center gap-2 text-critical">
          <OctagonX className="size-6" aria-hidden />
          <DialogTitle className="text-xl font-semibold">{decision.blocked ? "Payment stopped" : "Stop. This could be a scam."}</DialogTitle>
        </div>
        <DialogDescription id="high-risk-summary" className="mt-2 text-sm">
          {decision.summary}
        </DialogDescription>

        <div className="mt-4 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
          <RiskMeter score={decision.score} band="HIGH" size={170} thresholds={decision.thresholds} />
          <ReasonsList reasons={decision.reasons} tone="critical" />
        </div>

        <div className="mt-5 space-y-2">
          <Button variant="danger" size="lg" className="w-full" disabled={!!busy} onClick={() => onCancel(true)}>
            {busy === "report" ? <Loader2 className="animate-spin" /> : <Flag />}
            Cancel and report this account
          </Button>
          <Button variant="outline" className="w-full" disabled={!!busy} onClick={() => onCancel(false)}>
            {busy === "cancel" && <Loader2 className="animate-spin" />}
            Cancel payment
          </Button>
        </div>

        {decision.blocked ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Payments to this account are not allowed. If you were asked to pay it, the request is very likely a scam.
          </p>
        ) : (
          <>
            {!decision.contextAnswered && (
              <div className="mt-5 border-t border-border pt-4">
                <Questionnaire onSubmit={onAnswer} pending={busy === "context"} />
              </div>
            )}
            <div className="mt-5 border-t border-border pt-4">
              {!override ? (
                <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => setOverride(true)}>
                  I know this person and still want to pay
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm" aria-live="polite">
                    <Timer className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {left > 0 ? (
                      <span>
                        Take a moment. You can continue in <strong className="tabular">{left}s</strong>. Scammers rely on you hurrying.
                      </span>
                    ) : (
                      <span>Safety pause complete.</span>
                    )}
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-critical-mark transition-all duration-300" style={{ width: `${(1 - left / total) * 100}%` }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="retype">Type the recipient&apos;s UPI ID to confirm</Label>
                    <Input id="retype" autoComplete="off" spellCheck={false} placeholder="name@bank" value={retyped} onChange={(e) => setRetyped(e.target.value)} />
                  </div>
                  <Button variant="outline" className="w-full" disabled={left > 0 || !matches || !!busy} onClick={() => onPay(retyped)}>
                    {busy === "pay" && <Loader2 className="animate-spin" />}
                    Pay anyway
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
