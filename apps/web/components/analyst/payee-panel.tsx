import { Flag, XOctagon } from "lucide-react";
import type { ReactNode } from "react";
import { formatDateTime, formatINR } from "@/lib/format";
import type { AlertDetail } from "@/lib/types";
import { BandBadge } from "../band-badge";
import { Badge } from "../ui/badge";
import { DetailSection } from "./detail-section";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export function PayeePanel({ payee }: { payee: AlertDetail["payee"] }) {
  const reputation = Math.max(0, Math.min(100, Math.round(payee.reputationScore)));
  return (
    <DetailSection title="Payee" description={payee.upiId}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Display name">{payee.displayName ?? "Unknown"}</Fact>
        <Fact label="First seen">{payee.firstSeenAt ? formatDateTime(payee.firstSeenAt) : "Never before"}</Fact>
        <Fact label="Reports">{payee.reportCount}</Fact>
        <Fact label="Suspicion score">
          <span className="tabular">{reputation} / 100</span>
          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span className="block h-full rounded-full bg-muted-foreground" style={{ width: `${reputation}%` }} />
          </span>
        </Fact>
      </dl>
      <p className="mt-2 text-xs text-subtle">A higher suspicion score means more reports, confirmed fraud or money-mule signals.</p>
      {payee.confirmedFraudAt && (
        <Badge variant="critical" className="mt-3">
          <XOctagon aria-hidden /> Confirmed fraud since {formatDateTime(payee.confirmedFraudAt)}
        </Badge>
      )}

      <h4 className="mt-4 text-xs font-semibold text-muted-foreground">Recent payments to this payee (all users)</h4>
      {payee.history.length ? (
        <ul className="mt-1 max-h-60 divide-y divide-border overflow-y-auto text-sm">
          {payee.history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{h.userName}</span>
                <span className="block text-xs text-subtle">
                  {formatDateTime(h.createdAt)} · {h.status.toLowerCase()}
                </span>
              </span>
              {h.band && <BandBadge band={h.band} score={h.score} />}
              <span className="tabular w-24 text-right font-medium">{formatINR(h.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">No payments to this payee yet.</p>
      )}

      <h4 className="mt-4 text-xs font-semibold text-muted-foreground">Recent reports</h4>
      {payee.reports.length ? (
        <ul className="mt-1 space-y-1.5 text-sm">
          {payee.reports.map((r, i) => (
            <li key={`${r.createdAt}-${i}`} className="flex items-start gap-2">
              <Flag className="mt-0.5 size-3.5 shrink-0 text-critical" aria-hidden />
              <span>
                {r.reason}
                <span className="block text-xs text-subtle">{formatDateTime(r.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Nobody has reported this payee.</p>
      )}
    </DetailSection>
  );
}
