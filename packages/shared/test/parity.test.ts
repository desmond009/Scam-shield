import { describe, expect, it } from "vitest";
import fixture from "../fixtures/parity.json";
import { computeFeatures, evaluateRules, type FeatureInput } from "../src";

/** Cases are produced by services/ml (python -m scamshield_ml.parity_fixture). Both languages must agree exactly. */
describe("Node/Python feature and rule parity", () => {
  it.each(fixture.cases.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const features = computeFeatures(c.input as FeatureInput);
    expect(features).toEqual(c.features);
    const rules = evaluateRules(features);
    expect(rules.score).toBe(c.ruleScore);
    expect(rules.hits.map((h) => h.code)).toEqual(c.ruleCodes);
  });
});
