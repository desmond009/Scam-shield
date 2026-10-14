"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

export interface Answers {
  pressure: boolean;
  otpOrApp: boolean;
  knowRecipient: boolean;
}

const QUESTIONS: { key: keyof Answers; text: string }[] = [
  { key: "pressure", text: "Did someone call or message you asking you to pay urgently?" },
  { key: "otpOrApp", text: "Were you asked to share an OTP or install an app?" },
  { key: "knowRecipient", text: "Do you personally know this recipient?" },
];

/** Scam-context questions. Answers become features and the payment is re-scored. */
export function Questionnaire({ onSubmit, pending }: { onSubmit: (a: Answers) => void; pending: boolean }) {
  const [answers, setAnswers] = useState<Partial<Answers>>({});
  const complete = QUESTIONS.every((q) => answers[q.key] !== undefined);
  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium">Three quick questions</p>
        <p className="text-sm text-muted-foreground">Scammers often pressure people over the phone. Honest answers help us protect you.</p>
      </div>
      {QUESTIONS.map((q) => (
        <fieldset key={q.key} className="rounded-lg border border-border p-3">
          <legend className="sr-only">{q.text}</legend>
          <p className="text-sm">{q.text}</p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={q.text}>
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={answers[q.key] === v}
                onClick={() => setAnswers({ ...answers, [q.key]: v })}
                className={cn(
                  "rounded-md border border-border py-2 text-sm font-medium transition-colors hover:bg-surface-2",
                  answers[q.key] === v && "border-primary bg-primary-soft text-primary hover:bg-primary-soft",
                )}
              >
                {v ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <Button className="w-full" variant="secondary" disabled={!complete || pending} onClick={() => onSubmit(answers as Answers)}>
        {pending && <Loader2 className="animate-spin" />}
        Re-check with my answers
      </Button>
    </div>
  );
}
