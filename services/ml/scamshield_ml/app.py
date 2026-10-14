"""ScamShield ML scoring service.

POST /score       features -> calibrated fraud probability, 0-100 score, top contributing features, model version
GET  /health      liveness + whether a model is loaded
GET  /model       active version and training metrics
GET  /evaluation  rules vs ML vs hybrid comparison on the holdout
GET  /holdout-sample  labelled holdout rows for the admin what-if preview
POST /reload      reload the active model from disk
POST /train       retrain in the background with optional analyst labels; GET /train/status to poll
"""
import logging
import threading
import time
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, create_model

from .evaluate import evaluate
from .explain import top_contributions
from .model_store import current_version, load_artifact, read_json, set_current
from .spec import FEATURE_NAMES
from .train import train

log = logging.getLogger("scamshield.ml")
app = FastAPI(title="ScamShield ML", version="1.0.0")

FeatureVector = create_model(
    "FeatureVector",
    __config__=ConfigDict(extra="forbid"),
    **{name: (float, Field(...)) for name in FEATURE_NAMES},
)


class ScoreRequest(BaseModel):
    features: FeatureVector  # type: ignore[valid-type]
    explain: bool = True


class Contribution(BaseModel):
    feature: str
    value: float
    contribution: float


class ScoreResponse(BaseModel):
    probability: float
    score: float
    modelVersion: str
    topFeatures: list[Contribution]
    latencyMs: float


class LabelledExample(BaseModel):
    features: FeatureVector  # type: ignore[valid-type]
    label: Literal[0, 1]


class TrainRequest(BaseModel):
    labels: list[LabelledExample] = []


class _State:
    def __init__(self):
        self.artifact: dict | None = None
        self.lock = threading.Lock()
        self.train_job: dict = {"status": "idle"}

    def load(self) -> str | None:
        version = current_version()
        artifact = load_artifact(version) if version else None
        with self.lock:
            self.artifact = artifact
        return version


state = _State()


@app.on_event("startup")
def _startup() -> None:
    version = state.load()
    log.info("loaded model %s", version)


def _artifact() -> dict:
    artifact = state.artifact
    if artifact is None:
        raise HTTPException(503, "No model is loaded yet")
    return artifact


@app.get("/health")
def health() -> dict:
    artifact = state.artifact
    return {"status": "ok", "service": "ml", "modelLoaded": artifact is not None,
            "modelVersion": artifact["version"] if artifact else None}


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest) -> ScoreResponse:
    started = time.perf_counter()
    artifact = _artifact()
    x = np.array([getattr(req.features, n) for n in artifact["feature_names"]], dtype=float)
    probability = float(artifact["calibrated"].predict_proba(x[None, :])[0, 1])
    top = top_contributions(artifact, x) if req.explain else []
    return ScoreResponse(
        probability=round(probability, 5),
        score=round(probability * 100, 2),
        modelVersion=artifact["version"],
        topFeatures=top,
        latencyMs=round((time.perf_counter() - started) * 1000, 2),
    )


@app.get("/model")
def model() -> dict:
    version = _artifact()["version"]
    return {"version": version, "metrics": read_json(version, "metrics.json")}


@app.get("/evaluation")
def evaluation() -> dict:
    version = _artifact()["version"]
    ev = read_json(version, "evaluation.json")
    if ev is None:
        raise HTTPException(404, "No evaluation for the active model")
    return ev


@app.get("/holdout-sample")
def holdout_sample() -> dict:
    sample = read_json(_artifact()["version"], "holdout_sample.json")
    if sample is None:
        raise HTTPException(404, "No holdout sample for the active model")
    return sample


@app.post("/reload")
def reload() -> dict:
    return {"version": state.load()}


def _run_training(labels: list[LabelledExample]) -> None:
    try:
        extra = None
        if labels:
            extra = pd.DataFrame([{**l.features.model_dump(), "is_fraud": l.label} for l in labels])
        version = train(extra)
        state.train_job.update(status="evaluating", version=version)
        evaluate(version)
        set_current(version)
        state.load()
        state.train_job.update(status="completed", finishedAt=time.time())
    except Exception as exc:  # surfaced to the admin UI through /train/status
        log.exception("training failed")
        state.train_job.update(status="failed", error=str(exc), finishedAt=time.time())


@app.post("/train", status_code=202)
def start_training(req: TrainRequest) -> dict:
    with state.lock:
        if state.train_job.get("status") in ("training", "evaluating"):
            raise HTTPException(409, "Training already in progress")
        state.train_job = {"status": "training", "startedAt": time.time(), "analystLabels": len(req.labels)}
    threading.Thread(target=_run_training, args=(req.labels,), daemon=True).start()
    return state.train_job


@app.get("/train/status")
def training_status() -> dict:
    return state.train_job
