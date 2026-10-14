import { Ban, CheckCircle2, FlaskConical, ShieldOff, XOctagon } from "lucide-react";
import type { AlertSummary } from "@/lib/types";
import { Badge } from "../ui/badge";

/** Secondary facts about an alert, each as icon + text. */
export function AlertFlags({ alert, showOutcome = true }: { alert: AlertSummary; showOutcome?: boolean }) {
  return (
    <>
      {alert.blocked && (
        <Badge variant="critical">
          <Ban aria-hidden /> Blocked
        </Badge>
      )}
      {alert.degraded && (
        <Badge variant="outline" title="The ML service was unavailable, so this payment was scored by rules only">
          <ShieldOff aria-hidden /> Rules only
        </Badge>
      )}
      {alert.isSynthetic && (
        <Badge variant="outline" title="Created by the Simulator, not a real user">
          <FlaskConical aria-hidden /> Simulator
        </Badge>
      )}
      {showOutcome && alert.outcome === "FRAUD" && (
        <Badge variant="critical">
          <XOctagon aria-hidden /> Confirmed fraud
        </Badge>
      )}
      {showOutcome && alert.outcome === "SAFE" && (
        <Badge variant="good">
          <CheckCircle2 aria-hidden /> Marked safe
        </Badge>
      )}
    </>
  );
}
