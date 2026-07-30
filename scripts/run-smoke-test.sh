#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set local passwords." >&2
  exit 1
fi

docker compose up -d --build
node scripts/run-smoke-test.js
