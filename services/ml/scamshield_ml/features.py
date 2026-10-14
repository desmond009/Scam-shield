"""Python port of packages/shared/src/features.ts. Keep the two in sync; tests/test_parity.py enforces it."""
import math

from .jsmath import clamp, js_mod, js_round
from .spec import FEATURE_NAMES, FEATURE_SPEC

DAY_MS = 86_400_000
_TZ = FEATURE_SPEC["timezoneOffsetMinutes"]
_NIGHT_START = FEATURE_SPEC["nightStartHour"]
_NIGHT_END = FEATURE_SPEC["nightEndHour"]
_MIN_HISTORY = FEATURE_SPEC["minHistoryForStats"]


def empty_history() -> dict:
    return {"count": 0, "mean": 0.0, "std": 0.0, "max": 0.0, "hourSin": 0.0, "hourCos": 0.0}


def ist_hour(timestamp_ms: int) -> int:
    minutes = timestamp_ms // 60_000 + _TZ
    return int(((minutes % 1440) + 1440) % 1440 // 60)


def hour_angle(hour: int) -> float:
    return 2 * math.pi * hour / 24


def is_night_hour(hour: int) -> bool:
    return hour >= _NIGHT_START or hour < _NIGHT_END


def _hour_deviation(hour: int, h: dict) -> float:
    if h["count"] < _MIN_HISTORY:
        return 0.0
    mean_angle = math.atan2(h["hourSin"], h["hourCos"])
    mean_hour = js_mod(js_mod(mean_angle * 24 / (2 * math.pi), 24) + 24, 24)
    d = abs(hour - mean_hour)
    return min(d, 24 - d)


def _amount_zscore(amount: float, h: dict) -> float:
    if h["count"] < _MIN_HISTORY:
        return 0.0
    std = max(h["std"], 0.1 * h["mean"], 50)
    return clamp((amount - h["mean"]) / std, -5, 20)


def compute_features(inp: dict) -> dict:
    """inp uses the same camelCase keys as the TypeScript FeatureInput."""
    ts = inp["timestampMs"]
    hour = ist_hour(ts)
    h = inp["history"]
    ctx = inp.get("context") or {}
    first_seen = inp["payeeFirstSeenAtMs"]
    payee_age = 0.0 if first_seen is None else clamp((ts - first_seen) / DAY_MS, 0, 3650)
    raw = {
        "amount": inp["amount"],
        "amount_zscore_vs_user_30d": _amount_zscore(inp["amount"], h),
        "amount_to_user_max_ratio": clamp(inp["amount"] / h["max"], 0, 50) if h["count"] >= 1 and h["max"] > 0 else 1,
        "amount_to_balance_ratio": clamp(inp["amount"] / max(inp["balance"], 1), 0, 10),
        "is_new_payee_for_user": int(bool(inp["isNewPayee"])),
        "payee_age_days": payee_age,
        "payee_distinct_senders_24h": inp["payeeDistinctSenders24h"],
        "payee_report_count": inp["payeeReportCount"],
        "user_txn_count_10min": inp["userTxnCount10min"],
        "user_txn_count_1h": inp["userTxnCount1h"],
        "same_amount_repeat_count_1h": inp["sameAmountRepeat1h"],
        "hour_of_day": hour,
        "hour_deviation_from_user_norm": _hour_deviation(hour, h),
        "is_night": int(is_night_hour(hour)),
        "account_age_days": max(0, (ts - inp["accountCreatedAtMs"]) / DAY_MS),
        "is_new_device": int(bool(inp["isNewDevice"])),
        "failed_attempts_15min": inp["failedAttempts15min"],
        "ctx_pressure": int(bool(ctx.get("pressure"))),
        "ctx_otp_or_app": int(bool(ctx.get("otpOrApp"))),
        "ctx_unknown_recipient": int(bool(ctx.get("unknownRecipient"))),
    }
    return {name: js_round(float(raw[name]), 4) for name in FEATURE_NAMES}
