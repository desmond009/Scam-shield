import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { Band } from "@/lib/types";
import { Badge } from "./ui/badge";

export const BAND_META: Record<Band, { label: string; variant: "good" | "warning" | "critical"; Icon: typeof ShieldCheck }> = {
  LOW: { label: "Low risk", variant: "good", Icon: ShieldCheck },
  MEDIUM: { label: "Medium risk", variant: "warning", Icon: ShieldAlert },
  HIGH: { label: "High risk", variant: "critical", Icon: ShieldX },
};

/** Risk band: always icon + label, never colour alone. */
export function BandBadge({ band, score, className }: { band: Band; score?: number | null; className?: string }) {
  const { label, variant, Icon } = BAND_META[band];
  return (
    <Badge variant={variant} className={className}>
      <Icon aria-hidden />
      {label}
      {score != null && <span className="tabular opacity-80">· {Math.round(score)}</span>}
    </Badge>
  );
}
