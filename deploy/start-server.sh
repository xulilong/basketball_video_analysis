#!/bin/sh
set -eu
cd /app
.venv-analysis/bin/python deploy/check-models.py
exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3001
