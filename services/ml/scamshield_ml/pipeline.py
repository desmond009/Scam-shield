"""End-to-end offline pipeline: generate data -> train -> evaluate -> activate. Idempotent unless --force."""
import argparse

from . import generate_data
from .evaluate import evaluate
from .model_store import current_version, set_current
from .spec import DATA_DIR
from .train import train


def run(force: bool = False, seed: int = 42) -> str:
    existing = current_version()
    if existing and not force:
        print(f"model {existing} already active; use --force to rebuild")
        return existing
    data = DATA_DIR / "transactions.csv"
    if force or not data.exists():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        df = generate_data.generate(seed)
        df.to_csv(data, index=False)
        print(f"generated {len(df):,} synthetic transactions ({df.is_fraud.mean():.2%} fraud)")
    version = train()
    ev = evaluate(version)
    set_current(version)
    for name, s in ev["systems"].items():
        m = s["at_medium"]
        print(f"{name:11s} PR-AUC {s['pr_auc']:.3f}  precision {m['precision']:.3f}  recall {m['recall']:.3f}  FPR {m['fpr']:.4f}")
    print(f"activated {version}")
    return version


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    run(args.force, args.seed)
