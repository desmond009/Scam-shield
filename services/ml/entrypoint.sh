#!/bin/sh
set -e
uvicorn scamshield_ml.app:app --host 0.0.0.0 --port 8000 --workers 1
