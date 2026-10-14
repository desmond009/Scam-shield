"""Per-decision explanations by occlusion: how much does the fraud probability drop when one feature is reset to
the value of a typical legitimate payment? Model-agnostic, needs one batched predict, and easy to explain in a viva."""
import numpy as np


def top_contributions(artifact: dict, x: np.ndarray, k: int = 3) -> list[dict]:
    names = artifact["feature_names"]
    reference = artifact["reference"]
    batch = np.repeat(x[None, :], len(names) + 1, axis=0)
    for i in range(len(names)):
        batch[i + 1, i] = reference[i]
    p = artifact["raw"].predict_proba(batch)[:, 1]
    contributions = p[0] - p[1:]
    order = np.argsort(-contributions)[:k]
    return [
        {"feature": names[i], "value": float(x[i]), "contribution": round(float(contributions[i]), 4)}
        for i in order
        if contributions[i] > 0.005
    ]
