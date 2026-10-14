import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { Thresholds } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Returns a message per invalid field; empty when the thresholds can be saved. */
export function thresholdErrors(t: Thresholds): { medium?: string; high?: string } {
  const out: { medium?: string; high?: string } = {};
  if (!Number.isFinite(t.mediumThreshold) || t.mediumThreshold < 1 || t.mediumThreshold > 99) out.medium = "Use 1 to 99.";
  if (!Number.isFinite(t.highThreshold) || t.highThreshold < 2 || t.highThreshold > 100) out.high = "Use 2 to 100.";
  if (!out.medium && !out.high && t.mediumThreshold >= t.highThreshold) out.high = "High must be above medium.";
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function ThresholdsForm({ value, onChange }: { value: Thresholds; onChange: (t: Thresholds) => void }) {
  const errors = thresholdErrors(value);
  const num = (s: string) => (s === "" ? NaN : Number(s));
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-sm">
          <Label htmlFor="blend">Blend</Label>
          <span className="tabular text-muted-foreground">
            Rules {Math.round(value.ruleWeight * 100)}% · ML {Math.round(value.mlWeight * 100)}%
          </span>
        </div>
        <Slider
          id="blend"
          min={0}
          max={1}
          step={0.05}
          value={[value.mlWeight]}
          onValueChange={([ml]) => onChange({ ...value, mlWeight: round2(ml), ruleWeight: round2(1 - ml) })}
          aria-label="ML weight in the blended score"
        />
        <p className="text-xs text-subtle">Final score = rule weight × rule score + ML weight × ML score. Weights always sum to 100%.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["medium", "mediumThreshold", "Medium risk from score", 1, 99],
            ["high", "highThreshold", "High risk from score", 2, 100],
          ] as const
        ).map(([k, field, label, min, max]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`t-${k}`}>{label}</Label>
            <Input
              id={`t-${k}`}
              type="number"
              min={min}
              max={max}
              step={1}
              value={Number.isFinite(value[field]) ? value[field] : ""}
              aria-invalid={!!errors[k]}
              aria-describedby={errors[k] ? `t-${k}-err` : undefined}
              className={cn("tabular", errors[k] && "border-critical")}
              onChange={(e) => onChange({ ...value, [field]: num(e.target.value) })}
            />
            {errors[k] && (
              <p id={`t-${k}-err`} className="text-xs text-critical">
                {errors[k]}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
