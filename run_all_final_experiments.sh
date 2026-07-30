#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "[final] Starting Docker services"
docker compose up -d

echo "[final] Running final IEEE validation experiments"
node scripts/run-final-validation-experiments.js

echo "[final] Running results validator"
python3 scripts/results_validator.py

echo "[final] Completed successfully"
