"""Loads the shared feature/rule spec (packages/shared/spec) so Python and Node use identical definitions."""
import json
import os
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
SPEC_DIR = Path(os.environ.get("SHARED_SPEC_DIR", _REPO_ROOT / "packages" / "shared" / "spec"))
ML_ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = Path(os.environ.get("MODEL_DIR", ML_ROOT / "models"))
DATA_DIR = Path(os.environ.get("DATA_DIR", ML_ROOT / "data"))

FEATURE_SPEC = json.loads((SPEC_DIR / "features.json").read_text())
RULE_SPEC = json.loads((SPEC_DIR / "rules.json").read_text())

FEATURE_NAMES: list[str] = [f["name"] for f in FEATURE_SPEC["features"]]
DEFAULT_RULES: list[dict] = RULE_SPEC["rules"]
DEFAULT_THRESHOLDS: dict = RULE_SPEC["thresholds"]
