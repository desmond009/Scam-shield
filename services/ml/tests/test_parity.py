"""Feature/rule parity: the committed fixture (checked by the TypeScript test) must still match Python's output."""
import json

from scamshield_ml.features import compute_features
from scamshield_ml.parity_fixture import FIXTURE, build
from scamshield_ml.rules import evaluate_rules
from scamshield_ml.spec import FEATURE_NAMES


def test_fixture_is_up_to_date():
    committed = json.loads(FIXTURE.read_text())["cases"]
    assert committed == build(), "regenerate with: python -m scamshield_ml.parity_fixture"


def test_feature_order_matches_spec():
    case = json.loads(FIXTURE.read_text())["cases"][0]
    assert list(compute_features(case["input"])) == FEATURE_NAMES


def test_rules_score_known_scam():
    f = {n: 0 for n in FEATURE_NAMES} | {"is_new_payee_for_user": 1, "amount_to_user_max_ratio": 8,
                                         "payee_distinct_senders_24h": 9, "payee_age_days": 3}
    score, hits = evaluate_rules(f)
    assert score == 70 and [h["code"] for h in hits] == ["MULE_PATTERN", "AMOUNT_SPIKE", "NEW_PAYEE"]
