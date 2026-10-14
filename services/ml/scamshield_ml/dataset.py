"""Loading and time-based splitting. Splits are by time, never random, so evaluation mimics deployment."""
import pandas as pd

from .spec import DATA_DIR, FEATURE_NAMES

TRAIN_FRACTION = 0.60
CALIBRATION_FRACTION = 0.15  # the remaining 25% is the holdout test set


def load_transactions() -> pd.DataFrame:
    return pd.read_csv(DATA_DIR / "transactions.csv").sort_values("ts", kind="stable").reset_index(drop=True)


def time_split(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    t0, t1 = df.ts.min(), df.ts.max()
    train_end = t0 + (t1 - t0) * TRAIN_FRACTION
    calib_end = t0 + (t1 - t0) * (TRAIN_FRACTION + CALIBRATION_FRACTION)
    return {
        "train": df[df.ts < train_end],
        "calibration": df[(df.ts >= train_end) & (df.ts < calib_end)],
        "test": df[df.ts >= calib_end],
    }


def xy(df: pd.DataFrame):
    return df[FEATURE_NAMES].to_numpy(dtype=float), df["is_fraud"].to_numpy(dtype=int)
