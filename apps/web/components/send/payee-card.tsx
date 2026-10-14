import { BadgeCheck, CalendarClock, Flag, ShieldX, UserRound } from "lucide-react";
import type { PayeeLookup } from "@/lib/types";
import { Badge } from "../ui/badge";

function ageText(days: number | null) {
  if (days === null) return "Not seen on ScamShield before";
  if (days < 1) return "Joined today";
  if (days < 60) return `On ScamShield for ${days} day${days === 1 ? "" : "s"}`;
  if (days < 730) return `On ScamShield for ${Math.round(days / 30)} months`;
  return `On ScamShield for ${Math.round(days / 365)} years`;
}

/** What the payer should know about the recipient before typing an amount. */
export function PayeeCard({ payee }: { payee: PayeeLookup }) {
  const young = payee.ageDays === null || payee.ageDays < 30;
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
          <UserRound className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{payee.displayName ?? "Unknown recipient"}</p>
          <p className="truncate text-sm text-muted-foreground">{payee.upiId}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {payee.paidBefore ? (
          <Badge variant="good">
            <BadgeCheck aria-hidden /> You have paid them before
          </Badge>
        ) : (
          <Badge variant="outline">First payment to this person</Badge>
        )}
        <Badge variant={young ? "warning" : "outline"}>
          <CalendarClock aria-hidden /> {ageText(payee.ageDays)}
        </Badge>
        {payee.reportCount > 0 && (
          <Badge variant="critical">
            <Flag aria-hidden /> Reported {payee.reportCount} time{payee.reportCount === 1 ? "" : "s"}
          </Badge>
        )}
        {payee.confirmedFraud && (
          <Badge variant="critical">
            <ShieldX aria-hidden /> Confirmed scam account
          </Badge>
        )}
      </div>
    </div>
  );
}
