"""Scoring contract: request validation, response shape and latency of the FastAPI service."""
import time

import pytest
from fastapi.testclient import TestClient

from scamshield_ml.app import app
from scamshield_ml.model_store import current_version
from scamshield_ml.spec import FEATURE_NAMES

pytestmark = pytest.mark.skipif(current_version() is None, reason="run `python -m scamshield_ml.pipeline` first")

NORMAL = {n: 0.0 for n in FEATURE_NAMES} | {"amount": 250, "amount_to_user_max_ratio": 0.3, "payee_age_days": 400,
                                           "hour_of_day": 13, "account_age_days": 500, "amount_to_balance_ratio": 0.01}
SCAM = NORMAL | {"amount": 25000, "amount_zscore_vs_user_30d": 12, "amount_to_user_max_ratio": 9,
                 "amount_to_balance_ratio": 0.9, "is_new_payee_for_user": 1, "payee_age_days": 2,
                 "ctx_pressure": 1, "ctx_unknown_recipient": 1, "hour_of_day": 20}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_reports_model(client):
    body = client.get("/health").json()
    assert body["modelLoaded"] is True and body["modelVersion"] == current_version()


def test_score_contract_and_ordering(client):
    normal = client.post("/score", json={"features": NORMAL}).json()
    scam = client.post("/score", json={"features": SCAM}).json()
    for body in (normal, scam):
        assert set(body) == {"probability", "score", "modelVersion", "topFeatures", "latencyMs"}
        assert 0 <= body["probability"] <= 1 and body["score"] == pytest.approx(body["probability"] * 100, abs=0.01)
    assert scam["score"] > 50 > normal["score"]
    assert scam["topFeatures"] and all(f["feature"] in FEATURE_NAMES for f in scam["topFeatures"])


def test_rejects_missing_and_unknown_features(client):
    missing = {k: v for k, v in NORMAL.items() if k != "amount"}
    assert client.post("/score", json={"features": missing}).status_code == 422
    assert client.post("/score", json={"features": NORMAL | {"bogus": 1}}).status_code == 422


def test_p95_latency_under_50ms(client):
    durations = []
    for _ in range(100):
        t = time.perf_counter()
        client.post("/score", json={"features": SCAM})
        durations.append((time.perf_counter() - t) * 1000)
    durations.sort()
    assert durations[94] < 50


def test_evaluation_compares_three_systems(client):
    ev = client.get("/evaluation").json()
    assert set(ev["systems"]) == {"rules_only", "ml_only", "hybrid"}
    assert ev["holdout"]["fraud"] > 0
