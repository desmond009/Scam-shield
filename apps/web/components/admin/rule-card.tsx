import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";
import type { RuleConfigEntry, RuleView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PARAM_STEP, paramLabel, ruleTitle } from "./labels";

export const PARAM_MAX = 10_000;

export const paramValid = (v: number) => Number.isFinite(v) && v >= 0 && v <= PARAM_MAX;

const sameAsDefaults = (d: RuleConfigEntry, def: RuleConfigEntry) =>
  d.enabled === def.enabled && d.weight === def.weight && Object.keys(def.params).every((k) => d.params[k] === def.params[k]);

export function RuleCard({
  view,
  draft,
  onChange,
}: {
  view: RuleView;
  draft: RuleConfigEntry;
  onChange: (next: RuleConfigEntry) => void;
}) {
  const id = `rule-${draft.code}`;
  const title = ruleTitle(draft.code);
  return (
    <div className={cn("rounded-lg border border-border p-4", !draft.enabled && "bg-surface-2")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="font-mono text-xs text-subtle">
            {draft.code}
            {view.updatedAt && <span className="font-sans"> · edited {formatDateTime(view.updatedAt)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...view.defaults, params: { ...view.defaults.params } })}
            disabled={sameAsDefaults(draft, view.defaults)}
            aria-label={`Reset ${title} to defaults`}
          >
            <RotateCcw aria-hidden />
            Defaults
          </Button>
          <Switch checked={draft.enabled} onCheckedChange={(enabled) => onChange({ ...draft, enabled })} aria-label={`${title} enabled`} />
        </div>
      </div>

      <fieldset disabled={!draft.enabled} className="mt-3 space-y-3 disabled:opacity-60">
        <div>
          <div className="flex items-center justify-between text-sm">
            <Label htmlFor={`${id}-weight`}>Weight</Label>
            <span className="tabular text-muted-foreground">×{draft.weight.toFixed(1)}</span>
          </div>
          <Slider
            id={`${id}-weight`}
            min={0}
            max={3}
            step={0.1}
            value={[draft.weight]}
            onValueChange={([w]) => onChange({ ...draft, weight: Math.round(w * 10) / 10 })}
            aria-label={`${title} weight`}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(draft.params).map(([key, value]) => {
            const invalid = !paramValid(value);
            return (
              <div key={key} className="space-y-1">
                <Label htmlFor={`${id}-${key}`} className="text-xs text-muted-foreground">
                  {paramLabel(key)}
                </Label>
                <Input
                  id={`${id}-${key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={PARAM_MAX}
                  step={PARAM_STEP[key] ?? 1}
                  value={Number.isFinite(value) ? value : ""}
                  aria-invalid={invalid}
                  className={cn("tabular h-9", invalid && "border-critical")}
                  onChange={(e) => onChange({ ...draft, params: { ...draft.params, [key]: e.target.value === "" ? NaN : Number(e.target.value) } })}
                />
                {invalid && <p className="text-xs text-critical">Enter a number from 0 to {PARAM_MAX.toLocaleString("en-IN")}.</p>}
              </div>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
