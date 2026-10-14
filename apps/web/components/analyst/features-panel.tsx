import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatFeatureValue } from "@/lib/format";
import type { AlertDetail } from "@/lib/types";
import { featureName } from "../admin/labels";
import { DetailSection } from "./detail-section";

export function MlFeaturesPanel({ features }: { features: AlertDetail["mlTopFeatures"] }) {
  return (
    <DetailSection title="Top ML contributors" description="Features that moved the model score most for this payment.">
      {features?.length ? (
        <ul className="divide-y divide-border text-sm">
          {features.map((f) => {
            const up = f.contribution >= 0;
            const Icon = up ? ArrowUpRight : ArrowDownRight;
            return (
              <li key={f.feature} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{featureName(f.feature)}</span>
                  <span className="text-xs text-muted-foreground">Value {formatFeatureValue(f.feature, f.value)}</span>
                </span>
                <span className="tabular inline-flex shrink-0 items-center gap-1 text-xs">
                  <Icon className="size-3.5" aria-hidden />
                  {up ? "+" : "−"}
                  {Math.abs(f.contribution).toFixed(3)}
                  <span className="text-muted-foreground">{up ? "raises risk" : "lowers risk"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No model explanation: this payment was scored by rules only.</p>
      )}
    </DetailSection>
  );
}

export function FeatureTable({ features }: { features: AlertDetail["features"] }) {
  return (
    <DetailSection title="All features" description="The exact inputs the rules and model saw.">
      <div className="max-h-72 overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead className="sticky top-0 bg-surface-2 text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Feature
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Value
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Meaning
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {features.map((f) => (
              <tr key={f.name}>
                <th scope="row" className="px-3 py-1.5 font-medium" title={f.name}>
                  {featureName(f.name)}
                </th>
                <td className="tabular px-3 py-1.5 text-right">{formatFeatureValue(f.name, f.value)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{f.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DetailSection>
  );
}
