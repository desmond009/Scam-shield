#!/bin/sh
# Applies migrations and seeds demo data (idempotent), then starts the API.
set -e
npx prisma migrate deploy
node dist/src/seed/index.js
exec node dist/src/index.js
