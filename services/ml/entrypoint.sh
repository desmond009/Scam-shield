#!/bin/sh
# First boot: generate synthetic data, train and evaluate (skipped when a model already exists in the volume).
set -e
python -m scamshield_ml.pipeline
exec uvicorn scamshield_ml.app:app --host 0.0.0.0 --port 8000 --workers 1 --no-access-log
