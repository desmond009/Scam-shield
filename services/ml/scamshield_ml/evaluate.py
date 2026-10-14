"""Compare rules-only vs ML-only vs hybrid on the time-based holdout and write evaluation.json for the web app.

All three systems use the exact production definitions: rule scores come from the Python port of the shared rules
(parity-tested against TypeScript), the hybrid uses the same blend weights, thresholds and OTP hard override.
"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.inspection import permutation_importance  # noqa: E402
from sklearn.metrics import average_precision_score, precision_recall_curve, roc_auc_score  # noqa: E402

from .dataset import load_transactions, time_split, xy  # noqa: E402
from .model_store import load_artifact, read_json, version_dir, write_json  # noqa: E402
from .rules import apply_overrides, blend_scores, evaluate_rules  # noqa: E402
from .spec import DEFAULT_THRESHOLDS, FEATURE_NAMES  # noqa: E402

SYSTEMS = {"rules_only": "Rules only", "ml_only": "ML only", "hybrid": "Hybrid (rules + ML)"}
SEED = 7


def system_scores(df: pd.DataFrame, ml: np.ndarray) -> dict[str, np.ndarray]:
    rows = df[FEATURE_NAMES].to_dict("records")
    rule = np.array([evaluate_rules(r)[0] for r in rows])
    rules_only = np.array([apply_overrides(s, r) for s, r in zip(rule, rows)])
    hybrid = np.array([apply_overrides(blend_scores(s, m), r) for s, m, r in zip(rule, ml, rows)])
    return {"rules_only": rules_only, "ml_only": ml, "hybrid": hybrid, "rule_raw": rule}


def at_threshold(y: np.ndarray, s: np.ndarray, t: float) -> dict:
    flag = s >= t
    tp, fp = int(np.sum(flag & (y == 1))), int(np.sum(flag & (y == 0)))
    fn, tn = int(np.sum(~flag & (y == 1))), int(np.sum(~flag & (y == 0)))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "threshold": t, "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": round(precision, 4), "recall": round(recall, 4),
        "fpr": round(fp / (fp + tn) if fp + tn else 0.0, 5),
        "f1": round(2 * precision * recall / (precision + recall) if precision + recall else 0.0, 4),
        "flag_rate": round(float(flag.mean()), 5),
    }


def calibration_bins(y: np.ndarray, p: np.ndarray, n_bins: int = 10) -> dict:
    """Reliability diagram data: one entry per non-empty probability bin with its mean prediction, observed fraud
    rate and number of payments (so the UI never has to align separate arrays)."""
    edges = np.linspace(0, 1, n_bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, n_bins - 1)
    points = []
    for b in range(n_bins):
        mask = idx == b
        if mask.any():
            points.append({"bin": [round(float(edges[b]), 2), round(float(edges[b + 1]), 2)],
                           "predicted": round(float(p[mask].mean()), 4), "observed": round(float(y[mask].mean()), 4),
                           "count": int(mask.sum())})
    return {"points": points, "bin_counts": np.bincount(idx, minlength=n_bins).astype(int).tolist()}


def pr_points(y: np.ndarray, s: np.ndarray, n: int = 60) -> list[dict]:
    precision, recall, _ = precision_recall_curve(y, s)
    idx = np.unique(np.linspace(0, len(precision) - 1, n).astype(int))
    return [{"recall": round(float(recall[i]), 4), "precision": round(float(precision[i]), 4)} for i in idx]


def recall_at_matched_fpr(y: np.ndarray, scores: dict, target_fpr: float) -> dict:
    """For each system, the best recall achievable with FPR no higher than the target (searching 0.5-point steps)."""
    out = {}
    for name in SYSTEMS:
        best = None
        for t in np.arange(0, 100.5, 0.5):
            m = at_threshold(y, scores[name], float(t))
            if m["fpr"] <= target_fpr and (best is None or m["recall"] > best["recall"]):
                best = m
        out[name] = best
    return out


def evaluate(version: str) -> dict:
    artifact = load_artifact(version)
    test = time_split(load_transactions())["test"].reset_index(drop=True)
    X, y = xy(test)
    ml = np.round(artifact["calibrated"].predict_proba(X)[:, 1] * 100, 2)
    scores = system_scores(test, ml)
    t = DEFAULT_THRESHOLDS
    med, high = t["mediumThreshold"], t["highThreshold"]

    systems = {}
    for name, label in SYSTEMS.items():
        s = scores[name]
        systems[name] = {
            "label": label,
            "pr_auc": round(float(average_precision_score(y, s)), 4),
            "roc_auc": round(float(roc_auc_score(y, s)), 4),
            "at_medium": at_threshold(y, s, med),
            "at_high": at_threshold(y, s, high),
            "pr_curve": pr_points(y, s),
            "sweep": [at_threshold(y, s, float(th)) for th in range(0, 101, 5)],
        }

    rules_fpr = systems["rules_only"]["at_medium"]["fpr"]
    matched = recall_at_matched_fpr(y, scores, rules_fpr)
    flagged = {name: scores[name] >= med for name in SYSTEMS}
    per_scenario = []
    for scenario, grp in test.groupby("scenario"):
        idx = grp.index.to_numpy()
        is_fraud = bool(grp.is_fraud.iloc[0])
        per_scenario.append({
            "scenario": scenario, "is_fraud": is_fraud, "count": int(len(grp)),
            # For fraud scenarios this is recall; for legitimate ones it is the false-positive rate.
            **{name: round(float(flagged[name][idx].mean()), 4) for name in SYSTEMS},
        })

    calibration = calibration_bins(y, ml / 100)

    rng = np.random.default_rng(SEED)
    sample = rng.choice(len(X), size=min(30_000, len(X)), replace=False)
    imp = permutation_importance(artifact["raw"], X[sample], y[sample], scoring="average_precision",
                                 n_repeats=3, random_state=SEED)
    importance = sorted(
        ({"feature": f, "importance": round(float(m), 4)} for f, m in zip(FEATURE_NAMES, imp.importances_mean)),
        key=lambda d: -d["importance"],
    )

    hybrid_m, rules_m = matched["hybrid"], matched["rules_only"]
    evaluation = {
        "version": version,
        "holdout": {"rows": int(len(test)), "fraud": int(y.sum()), "fraud_rate": round(float(y.mean()), 4),
                    "from_ts": int(test.ts.min()), "to_ts": int(test.ts.max())},
        "thresholds": t,
        "systems": systems,
        "matched_fpr": {"target_fpr": rules_fpr, "systems": matched},
        "hybrid_beats_rules_on_recall_at_matched_fpr": bool(hybrid_m and rules_m and hybrid_m["recall"] > rules_m["recall"]),
        "per_scenario": per_scenario,
        "calibration": calibration,
        "feature_importance": importance,
        "notes": [
            "Holdout = the last 25% of the synthetic timeline; the model never saw it during training or calibration.",
            "The confirmed-fraud-payee hard override needs analyst labels and is not exercised offline.",
            "Synthetic data: absolute numbers show the method works, not real-world performance.",
        ],
    }
    write_json(version, "evaluation.json", evaluation)
    _write_holdout_sample(version, test, ml, rng)
    _plots(version, y, scores, systems, calibration, importance)
    return evaluation


def _write_holdout_sample(version: str, test: pd.DataFrame, ml: np.ndarray, rng) -> None:
    """Labelled sample for the admin what-if preview: all fraud plus a weighted sample of legitimate rows."""
    fraud_idx = np.flatnonzero(test.is_fraud.to_numpy() == 1)
    legit_idx = np.flatnonzero(test.is_fraud.to_numpy() == 0)
    legit_sample = rng.choice(legit_idx, size=min(4000, len(legit_idx)), replace=False)
    legit_weight = len(legit_idx) / len(legit_sample)
    rows = []
    for i, w in [(i, 1.0) for i in fraud_idx] + [(i, legit_weight) for i in legit_sample]:
        r = test.iloc[i]
        rows.append({"features": {f: float(r[f]) for f in FEATURE_NAMES}, "mlScore": float(ml[i]),
                     "isFraud": int(r.is_fraud), "weight": round(w, 4), "scenario": r.scenario})
    write_json(version, "holdout_sample.json", {"version": version, "rows": rows})


def _plots(version, y, scores, systems, calibration, importance) -> None:
    out = version_dir(version) / "plots"
    out.mkdir(exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 4.5))
    for name, label in SYSTEMS.items():
        p, r, _ = precision_recall_curve(y, scores[name])
        ax.plot(r, p, label=f"{label} (AP {systems[name]['pr_auc']:.2f})")
    ax.set(xlabel="Recall", ylabel="Precision", title="Precision-recall on holdout")
    ax.legend()
    fig.savefig(out / "pr_curve.png", dpi=120, bbox_inches="tight")

    fig, ax = plt.subplots(figsize=(5, 5))
    pts = calibration["points"]
    ax.plot([0, 1], [0, 1], "--", color="grey", label="Perfect")
    ax.plot([p["predicted"] for p in pts], [p["observed"] for p in pts], "o-", label="Model")
    ax.set(xlabel="Predicted probability", ylabel="Observed fraud rate", title="Calibration (holdout)")
    ax.legend()
    fig.savefig(out / "calibration.png", dpi=120, bbox_inches="tight")

    m = systems["hybrid"]["at_medium"]
    fig, ax = plt.subplots(figsize=(4, 4))
    ax.imshow([[m["tn"], m["fp"]], [m["fn"], m["tp"]]], cmap="Blues")
    for (i, j), v in np.ndenumerate([[m["tn"], m["fp"]], [m["fn"], m["tp"]]]):
        ax.text(j, i, f"{v:,}", ha="center", va="center")
    ax.set(xticks=[0, 1], yticks=[0, 1], xticklabels=["Allowed", "Flagged"], yticklabels=["Legit", "Fraud"],
           title="Hybrid confusion matrix (score >= medium)")
    fig.savefig(out / "confusion_matrix.png", dpi=120, bbox_inches="tight")

    fig, ax = plt.subplots(figsize=(6, 5))
    top = importance[:12][::-1]
    ax.barh([d["feature"] for d in top], [d["importance"] for d in top])
    ax.set(title="Permutation importance (drop in PR-AUC)")
    fig.savefig(out / "feature_importance.png", dpi=120, bbox_inches="tight")
    plt.close("all")


if __name__ == "__main__":
    import sys

    from .model_store import current_version

    v = sys.argv[1] if len(sys.argv) > 1 else current_version()
    ev = evaluate(v)
    print(read_json(v, "metrics.json"))
    for name, s in ev["systems"].items():
        print(name, "PR-AUC", s["pr_auc"], "@medium", {k: s["at_medium"][k] for k in ("precision", "recall", "fpr")})
