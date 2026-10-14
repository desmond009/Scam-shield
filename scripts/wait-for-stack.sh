#!/usr/bin/env bash
# Waits until the web app and API are ready, then prints demo info.
set -euo pipefail
deadline=$((SECONDS + 900))
printf "Waiting for ScamShield (first run trains the model, ~2-4 min)"
until curl -fsS http://localhost:4000/ready >/dev/null 2>&1 && curl -fsS http://localhost:3000 >/dev/null 2>&1 \
  && curl -fsS http://localhost:8000/health >/dev/null 2>&1; do
  if (( SECONDS > deadline )); then echo; echo "Timed out. Check: docker compose logs"; exit 1; fi
  printf "."; sleep 5
done
echo
cat <<'TXT'
ScamShield is up.
  Web app:   http://localhost:3000
  API docs:  http://localhost:4000/docs
  ML model:  http://localhost:8000/model

Demo accounts (password: Demo@1234)
  user     asha@demo.scamshield.in
  analyst  ravi@demo.scamshield.in
  admin    admin@demo.scamshield.in
TXT
