"use client";

import { formatINR, timeAgo } from "@/lib/format";
import type { AlertSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BandBadge } from "../band-badge";
import { Badge } from "../ui/badge";
import { AlertFlags } from "./alert-flags";

export function AlertList({
  items,
  selectedId,
  freshIds,
  onSelect,
}: {
  items: AlertSummary[];
  selectedId: string | null;
  freshIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-border" aria-label="Alerts">
      {items.map((a) => {
        const fresh = freshIds.has(a.id);
        const selected = a.id === selectedId;
        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onSelect(a.id)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full flex-col gap-1.5 border-l-2 border-transparent px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                selected && "border-primary bg-primary-soft hover:bg-primary-soft",
                fresh && !selected && "bg-primary-soft/60",
              )}
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <BandBadge band={a.band} score={a.score} />
                {fresh && <Badge variant="primary">New</Badge>}
                <span className="tabular ml-auto text-sm font-semibold">{formatINR(a.amount)}</span>
              </span>
              <span className="min-w-0 text-sm">
                <span className="font-medium">{a.userName}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="break-all">{a.payeeUpiId}</span>
              </span>
              {a.topReasons.length > 0 && <span className="line-clamp-1 text-xs text-muted-foreground">{a.topReasons.join(" · ")}</span>}
              <span className="flex flex-wrap items-center gap-1.5">
                <AlertFlags alert={a} />
                <span className="ml-auto text-xs text-subtle">{timeAgo(a.createdAt)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
