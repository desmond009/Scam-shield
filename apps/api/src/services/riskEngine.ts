import { decide, evaluateRules, type DecisionOutcome, type Features, type RuleResult } from "@scamshield/shared";
import { getRiskConfig } from "./config.service";
import { scoreWithMl, type MlScore } from "./mlClient";

export interface RiskAssessment {
  outcome: DecisionOutcome;
  rules: RuleResult;
  ml: MlScore | null;
}

/** Hybrid engine: deterministic rules + calibrated ML, blended, with hard overrides (see shared/blend.ts). */
export async function assessRisk(features: Features, payeeConfirmedFraud: boolean): Promise<RiskAssessment> {
  const { rules: ruleConfig, thresholds } = await getRiskConfig();
  const rules = evaluateRules(features, ruleConfig);
  const ml = await scoreWithMl(features);
  const outcome = decide({
    ruleScore: rules.score,
    hits: rules.hits,
    mlScore: ml ? ml.score : null,
    features,
    payeeConfirmedFraud,
    thresholds,
  });
  return { outcome, rules, ml };
}
