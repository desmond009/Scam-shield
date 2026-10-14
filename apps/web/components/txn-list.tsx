import { ArrowUpRight } from "lucide-react";
import { formatDateTime, formatINR } from "@/lib/format";
import type { TxnItem, TxnStatus } from "@/lib/types";
import { BandBadge } from "./band-badge";
import { Badge } from "./ui/badge";

const STATUS: Record<TxnStatus, { label: string; variant: "default" | "good" | "warning" | "critical" | "outline" }> = {
  COMPLETED: { label: "Paid", variant: "outline" },
  PENDING: { label: "Not sent", variant: "outline" },
  CANCELLED: { label: "Cancelled", variant: "default" },
  BLOCKED: { label: "Stopped", variant: "critical" },
};

export function TxnList({ items }: { items: TxnItem[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground">
            <ArrowUpRight className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{t.payeeName ?? t.payeeUpiId}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t.payeeUpiId} · {formatDateTime(t.createdAt)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`tabular text-sm font-medium ${t.status === "COMPLETED" ? "" : "text-muted-foreground line-through"}`}>
              −{formatINR(t.amount)}
            </span>
            <span className="flex gap-1">
              {t.band && t.band !== "LOW" && <BandBadge band={t.band} />}
              {t.status !== "COMPLETED" && <Badge variant={STATUS[t.status].variant}>{STATUS[t.status].label}</Badge>}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
