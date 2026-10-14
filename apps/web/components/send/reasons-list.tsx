import { CircleAlert } from "lucide-react";
import type { RenderedReason } from "@/lib/types";

/** At most three plain-language reasons (alert-fatigue principle); the API already limits and orders them. */
export function ReasonsList({ reasons, tone }: { reasons: RenderedReason[]; tone: "warning" | "critical" }) {
  if (!reasons.length) return null;
  return (
    <ul className="space-y-2">
      {reasons.map((r) => (
        <li key={r.code} className="flex gap-2.5 rounded-lg bg-surface-2/60 p-3 text-sm">
          <CircleAlert className={`mt-0.5 size-4 shrink-0 ${tone === "critical" ? "text-critical" : "text-warning"}`} aria-hidden />
          <span>
            <span className="font-medium">{r.title}.</span> <span className="text-muted-foreground">{r.message}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
