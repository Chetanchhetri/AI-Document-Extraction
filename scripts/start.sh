#!/bin/sh
# Container entrypoint: migrate, then serve. (Render's free plan has no pre-deploy hook / shell.)
set -e
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --proxy-headers --forwarded-allow-ips='*' --workers 1 --no-server-header
