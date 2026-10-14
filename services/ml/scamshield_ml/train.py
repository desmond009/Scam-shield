"""Train the scam model on the synthetic data (+ optional analyst labels), calibrate it and save a versioned artefact.

Models: a logistic-regression baseline and a histogram gradient-boosting model (production). Class imbalance is
handled with balanced class weights; probabilities are then calibrated with isotonic regression on a later,
separate time slice so the 0-100 ML score means "estimated probability of fraud x 100".
"""
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .dataset import load_transactions, time_split, xy
from .model_store import version_dir, write_json
from .spec import FEATURE_NAMES

SEED = 42


def _gbm() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.08, max_leaf_nodes=31, l2_regularization=1.0,
        class_weight="balanced", early_stopping=False, random_state=SEED,
    )


def _logreg():
    return make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=3000))


def _calibrate(model, X, y):
    return CalibratedClassifierCV(FrozenEstimator(model), method="isotonic").fit(X, y)


def _scores(model, X, y) -> dict:
    p = model.predict_proba(X)[:, 1]
    return {"pr_auc": round(float(average_precision_score(y, p)), 4), "roc_auc": round(float(roc_auc_score(y, p)), 4),
            "brier": round(float(brier_score_loss(y, p)), 5)}


def train(extra_labels: pd.DataFrame | None = None) -> str:
    """Trains, saves models/<version>/model.joblib + metrics.json and returns the version (not yet activated)."""
    started = time.time()
    splits = time_split(load_transactions())
    train_df = splits["train"]
    if extra_labels is not None and len(extra_labels):
        # Analyst labels are the newest data; they only ever go into training, never into the holdout.
        train_df = pd.concat([train_df, extra_labels[FEATURE_NAMES + ["is_fraud"]]], ignore_index=True)
    X_tr, y_tr = xy(train_df)
    X_cal, y_cal = xy(splits["calibration"])
    X_te, y_te = xy(splits["test"])

    gbm = _gbm().fit(X_tr, y_tr)
    logreg = _logreg().fit(X_tr, y_tr)
    gbm_cal, logreg_cal = _calibrate(gbm, X_cal, y_cal), _calibrate(logreg, X_cal, y_cal)

    version = "gbm-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out = version_dir(version)
    (out / "plots").mkdir(parents=True, exist_ok=True)
    legit = X_tr[y_tr == 0]
    artifact = {
        "version": version,
        "feature_names": FEATURE_NAMES,
        "calibrated": gbm_cal,
        "raw": gbm,
        # Reference point for per-decision explanations: the median legitimate payment.
        "reference": np.median(legit, axis=0),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(artifact, out / "model.joblib")
    metrics = {
        "version": version,
        "trained_at": artifact["trained_at"],
        "algorithm": "HistGradientBoostingClassifier + isotonic calibration",
        "train_seconds": round(time.time() - started, 1),
        "rows": {k: int(len(v)) for k, v in splits.items()} | {"analyst_labels": 0 if extra_labels is None else int(len(extra_labels))},
        "fraud_rate": {k: round(float(v.is_fraud.mean()), 4) for k, v in splits.items()},
        "split": "time-based: first 60% of the timeline train, next 15% calibration, last 25% holdout",
        "holdout": {
            "gbm_calibrated": _scores(gbm_cal, X_te, y_te),
            "gbm_uncalibrated": _scores(gbm, X_te, y_te),
            "logreg_calibrated": _scores(logreg_cal, X_te, y_te),
        },
    }
    write_json(version, "metrics.json", metrics)
    joblib.dump(logreg_cal, out / "baseline_logreg.joblib")
    return version


if __name__ == "__main__":
    v = train()
    print(f"trained {v}")
