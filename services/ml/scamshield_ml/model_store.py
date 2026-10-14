"""Model artefact layout: models/<version>/{model.joblib, metrics.json, evaluation.json, plots/}; models/current.json."""
import json
from pathlib import Path

import joblib

from .spec import MODEL_DIR


def version_dir(version: str) -> Path:
    return MODEL_DIR / version


def current_version() -> str | None:
    pointer = MODEL_DIR / "current.json"
    return json.loads(pointer.read_text())["version"] if pointer.exists() else None


def set_current(version: str) -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    tmp = MODEL_DIR / "current.json.tmp"
    tmp.write_text(json.dumps({"version": version}))
    tmp.replace(MODEL_DIR / "current.json")


def load_artifact(version: str) -> dict:
    return joblib.load(version_dir(version) / "model.joblib")


def read_json(version: str, name: str) -> dict | None:
    path = version_dir(version) / name
    return json.loads(path.read_text()) if path.exists() else None


def write_json(version: str, name: str, data: dict) -> None:
    (version_dir(version) / name).write_text(json.dumps(data, indent=2))
