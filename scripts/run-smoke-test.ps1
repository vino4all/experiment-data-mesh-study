$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
  throw "Missing .env. Copy .env.example to .env and set local passwords."
}

docker compose up -d --build
node scripts/run-smoke-test.js
