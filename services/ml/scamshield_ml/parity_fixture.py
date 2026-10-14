"""Writes packages/shared/fixtures/parity.json: random FeatureInputs with the features and rule scores Python
computes. The TypeScript test recomputes them and must match exactly (see packages/shared/test/parity.test.ts)."""
import json
import random

from .features import DAY_MS, compute_features
from .rules import evaluate_rules
from .spec import SPEC_DIR

FIXTURE = SPEC_DIR.parent / "fixtures" / "parity.json"
NOW = 1_780_000_000_000


def random_input(r: random.Random) -> dict:
    count = r.choice([0, 1, 2, 3, 10, 80])
    mean = r.uniform(50, 5000)
    return {
        "amount": round(r.choice([r.uniform(1, 500), r.uniform(500, 20000), r.uniform(20000, 100000)]), 2),
        "balance": round(r.uniform(0, 300000), 2),
        "timestampMs": NOW + r.randint(0, 30 * DAY_MS),
        "accountCreatedAtMs": NOW - r.randint(0, 1500 * DAY_MS),
        "history": {"count": count, "mean": mean if count else 0, "std": r.uniform(0, 3000) if count else 0,
                    "max": mean * r.uniform(1, 5) if count else 0,
                    "hourSin": r.uniform(-count, count), "hourCos": r.uniform(-count, count)},
        "isNewPayee": r.random() < 0.4,
        "payeeFirstSeenAtMs": None if r.random() < 0.2 else NOW - r.randint(0, 900 * DAY_MS),
        "payeeDistinctSenders24h": r.choice([0, 0, 1, 4, 5, 12]),
        "payeeReportCount": r.choice([0, 0, 0, 1, 2, 5]),
        "userTxnCount10min": r.choice([0, 0, 1, 3, 6]),
        "userTxnCount1h": r.choice([0, 1, 2, 6, 9]),
        "sameAmountRepeat1h": r.choice([0, 0, 1, 2, 4]),
        "isNewDevice": r.random() < 0.2,
        "failedAttempts15min": r.choice([0, 0, 1, 3, 6]),
        "context": None if r.random() < 0.6 else {
            "pressure": r.random() < 0.5, "otpOrApp": r.random() < 0.3, "unknownRecipient": r.random() < 0.5},
    }


def build(n: int = 300, seed: int = 1) -> list[dict]:
    r = random.Random(seed)
    cases = []
    for _ in range(n):
        inp = random_input(r)
        features = compute_features(inp)
        score, hits = evaluate_rules(features)
        cases.append({"input": inp, "features": features, "ruleScore": score, "ruleCodes": [h["code"] for h in hits]})
    return cases


if __name__ == "__main__":
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps({"cases": build()}, indent=1))
    print(f"wrote {FIXTURE}")
