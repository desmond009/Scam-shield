import type { AlertDetail } from "@/lib/types";
import { DetailSection } from "./detail-section";

function Score({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-lg font-semibold">{value == null ? "—" : Math.round(value)}</p>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}

const ANSWERS: { key: keyof NonNullable<AlertDetail["contextAnswers"]>; question: string }[] = [
  { key: "pressure", question: "Asked to pay urgently by a caller or message?" },
  { key: "otpOrApp", question: "Asked to share an OTP or install an app?" },
  { key: "knowRecipient", question: "Personally knows the recipient?" },
];

export function ScoreBreakdown({ alert }: { alert: AlertDetail }) {
  return (
    <DetailSection
      title="Score breakdown"
      description={`All scores are 0–100. Decided in ${Math.round(alert.latencyMs)} ms${alert.modelVersion ? ` with model ${alert.modelVersion}` : ""}.`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Score label="Rules" value={alert.ruleScore} />
        <Score label="ML model" value={alert.mlScore} hint={alert.mlScore == null ? "Unavailable" : undefined} />
        <Score label="Final" value={alert.score} />
        {alert.preContextScore != null && <Score label="Before questions" value={alert.preContextScore} />}
      </div>
      {alert.contextAnswers && (
        <dl className="mt-3 divide-y divide-border rounded-lg border border-border text-sm">
          {ANSWERS.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{a.question}</dt>
              <dd className="font-medium">{alert.contextAnswers![a.key] ? "Yes" : "No"}</dd>
            </div>
          ))}
        </dl>
      )}
    </DetailSection>
  );
}
