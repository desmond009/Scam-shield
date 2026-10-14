"""Python port of packages/shared/src/rules.ts and blend.ts (scores only; user-facing text lives in TypeScript)."""
from .jsmath import js_round
from .spec import DEFAULT_RULES, DEFAULT_THRESHOLDS


def _hit(cond: bool, points: float) -> float | None:
    return points if cond else None


RULES = {
    "NEW_PAYEE": lambda f, p: _hit(f["is_new_payee_for_user"] == 1, p["points"]),
    "AMOUNT_SPIKE": lambda f, p: _hit(
        f["amount_zscore_vs_user_30d"] >= p["minZscore"] or f["amount_to_user_max_ratio"] >= p["minMaxRatio"], p["points"]
    ),
    "DRAIN_BALANCE": lambda f, p: _hit(f["amount_to_balance_ratio"] >= p["minBalanceRatio"], p["points"]),
    "VELOCITY_BURST": lambda f, p: _hit(
        f["user_txn_count_10min"] >= p["min10min"] or f["user_txn_count_1h"] >= p["min1h"], p["points"]
    ),
    "SPLIT_PAYMENTS": lambda f, p: _hit(f["same_amount_repeat_count_1h"] >= p["minRepeats"], p["points"]),
    "ODD_HOUR": lambda f, p: _hit(
        f["is_night"] == 1 and f["hour_deviation_from_user_norm"] >= p["minHourDeviation"], p["points"]
    ),
    "MULE_PATTERN": lambda f, p: _hit(
        f["payee_distinct_senders_24h"] >= p["minDistinctSenders"] and f["payee_age_days"] <= p["maxPayeeAgeDays"],
        p["points"],
    ),
    "REPORTED_PAYEE": lambda f, p: _hit(
        f["payee_report_count"] >= 1,
        min(p["maxPoints"], p["points"] + (f["payee_report_count"] - 1) * p["pointsPerExtraReport"]),
    ),
    "NEW_DEVICE": lambda f, p: _hit(f["is_new_device"] == 1, p["points"]),
    "REPEATED_FAILED_ATTEMPTS": lambda f, p: _hit(f["failed_attempts_15min"] >= p["minFailures"], p["points"]),
    "CONTEXT_PRESSURE": lambda f, p: (
        f["ctx_pressure"] * p["pressurePoints"]
        + f["ctx_otp_or_app"] * p["otpPoints"]
        + f["ctx_unknown_recipient"] * p["unknownRecipientPoints"]
    )
    or None,
}


def evaluate_rules(features: dict, configs: list[dict] = DEFAULT_RULES) -> tuple[float, list[dict]]:
    hits = []
    for cfg in configs:
        if not cfg["enabled"] or cfg["code"] not in RULES:
            continue
        points = RULES[cfg["code"]](features, cfg["params"])
        if points is not None:
            hits.append({"code": cfg["code"], "points": js_round(points * cfg["weight"], 2)})
    hits.sort(key=lambda h: -h["points"])  # stable, like Array.prototype.sort
    total = sum(h["points"] for h in hits)
    return js_round(min(100, total), 2), hits


def blend_scores(rule_score: float, ml_score: float | None, t: dict = DEFAULT_THRESHOLDS) -> float:
    raw = rule_score if ml_score is None else t["ruleWeight"] * rule_score + t["mlWeight"] * ml_score
    return js_round(min(100, max(0, raw)), 1)


def apply_overrides(score: float, features: dict, t: dict = DEFAULT_THRESHOLDS) -> float:
    """The OTP/app-request hard override (the confirmed-fraud-payee override needs analyst labels, absent offline)."""
    return max(score, t["highThreshold"]) if features["ctx_otp_or_app"] == 1 else score


def band_for(score: float, t: dict = DEFAULT_THRESHOLDS) -> str:
    if score >= t["highThreshold"]:
        return "HIGH"
    if score >= t["mediumThreshold"]:
        return "MEDIUM"
    return "LOW"
