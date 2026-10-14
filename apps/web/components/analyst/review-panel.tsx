"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XOctagon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { AlertDetail } from "@/lib/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/input";
import { Label } from "../ui/label";
import { DetailSection } from "./detail-section";

type Outcome = "FRAUD" | "SAFE";

export function ReviewPanel({ alert }: { alert: AlertDetail }) {
  return alert.status === "OPEN" ? <ReviewForm alertId={alert.id} /> : <ReviewResult alert={alert} />;
}

function ReviewForm({ alertId }: { alertId: string }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const review = useMutation({
    mutationFn: (outcome: Outcome) => api<AlertDetail>(`/alerts/${alertId}/review`, { method: "POST", body: { outcome, notes } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["alert", alertId], data);
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success(data.outcome === "FRAUD" ? "Confirmed as fraud. Payments to this payee are now blocked." : "Marked as safe.");
    },
  });
  const pending = review.isPending ? review.variables : null;

  return (
    <DetailSection title="Your review">
      <div className="space-y-2">
        <Label htmlFor="review-notes">Notes (optional)</Label>
        <Textarea
          id="review-notes"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What made you decide? For example: caller posed as bank staff"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="danger" disabled={review.isPending} onClick={() => review.mutate("FRAUD")}>
          {pending === "FRAUD" ? <Loader2 className="animate-spin" /> : <XOctagon />} Confirm fraud
        </Button>
        <Button variant="outline" disabled={review.isPending} onClick={() => review.mutate("SAFE")}>
          {pending === "SAFE" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Mark safe
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Confirming fraud blocks all future payments to this payee, for every user. Marking safe only closes this alert.
      </p>
      {review.isError && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {errorMessage(review.error)}
        </p>
      )}
    </DetailSection>
  );
}

function ReviewResult({ alert }: { alert: AlertDetail }) {
  return (
    <DetailSection title="Review">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {alert.outcome === "FRAUD" ? (
          <Badge variant="critical">
            <XOctagon aria-hidden /> Confirmed fraud
          </Badge>
        ) : (
          <Badge variant="good">
            <CheckCircle2 aria-hidden /> Marked safe
          </Badge>
        )}
        <span className="text-muted-foreground">
          by {alert.analystName ?? "an analyst"}
          {alert.reviewedAt && ` · ${formatDateTime(alert.reviewedAt)}`}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{alert.notes || <span className="text-muted-foreground">No notes.</span>}</p>
    </DetailSection>
  );
}
