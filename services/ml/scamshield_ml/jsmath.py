"""Helpers that reproduce JavaScript number semantics so Node and Python produce bit-identical features."""
import math


def js_round(value: float, decimals: int = 0) -> float:
    """Math.round(v * 10^d) / 10^d. Python's round() uses banker's rounding, which would break parity."""
    factor = 10**decimals
    return math.floor(value * factor + 0.5) / factor


def js_mod(a: float, b: float) -> float:
    """JavaScript % (sign follows the dividend)."""
    return math.fmod(a, b)


def clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))
