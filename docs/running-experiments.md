# Running the Experiment

> Public-release note: the quick smoke path and final artifact validation are in
> `README.md`. The older k6 phase examples below are retained as supplemental
> workload recipes, not as the authoritative provenance for the accepted-paper
> result claims.

This guide walks through setting up, running, and analyzing results from the experimental platform.

## Setup

### 1. Prerequisites

Install:
- Docker & Docker Compose
- k6 (https://k6.io/docs/getting-started/installation/)
- jq (for JSON processing)
- curl (usually pre-installed)

### 2. Clone and Build

```bash
cd experiment-data-mesh-study
cp .env.example .env
docker-compose build
```

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Verify Health

```bash
# Check service health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health

# View logs
docker-compose logs -f client-service
docker-compose logs -f orders-service
docker-compose logs -f orders-projection-consumer
docker-compose logs -f batch-sync-worker
```

### 5. Seed Data

```bash
bash scripts/seed-data.sh
```

Verify:
```bash
curl http://localhost:3001/clients
curl http://localhost:3002/orders
```

### 6. Access Dashboards

- **Grafana**: http://127.0.0.1:3000 (use the admin password set in your ignored `.env`)
- **Prometheus**: http://localhost:9090
- **Kafka UI**: http://localhost:8080

---

## Running Experiments

### Phase 1: Baseline (5 min per pattern)

By default, the k6 scripts target `http://localhost:3002`. If you run k6 from inside another container or a remote host, set `ORDERS_SERVICE_URL` or `K6_ORDERS_SERVICE_URL` explicitly.

```bash
# Pattern A: Direct API
k6 run load-tests/api-direct-k6.js \
  -e K6_VU=10 \
  -e K6_DURATION=5m \
  --out json=results/api-baseline.json

# Pattern B: Event-Driven
k6 run load-tests/event-projection-k6.js \
  -e K6_VU=10 \
  -e K6_DURATION=5m \
  --out json=results/projection-baseline.json

# Pattern C: Batch Replication
k6 run load-tests/batch-replication-k6.js \
  -e K6_VU=10 \
  -e K6_DURATION=5m \
  --out json=results/batch-baseline.json
```

### Phase 2: Load Ramp (5 min per pattern)

```bash
# Pattern A
k6 run load-tests/api-direct-k6.js \
  -e K6_VU=20 \
  -e K6_DURATION=5m \
  --out json=results/api-ramp.json

# Pattern B
k6 run load-tests/event-projection-k6.js \
  -e K6_VU=20 \
  -e K6_DURATION=5m \
  --out json=results/projection-ramp.json

# Pattern C
k6 run load-tests/batch-replication-k6.js \
  -e K6_VU=20 \
  -e K6_DURATION=5m \
  --out json=results/batch-ramp.json
```

### Phase 3: Sustained Load (10 min per pattern)

```bash
# Pattern A
k6 run load-tests/api-direct-k6.js \
  -e K6_VU=30 \
  -e K6_DURATION=10m \
  --out json=results/api-sustained.json

# Pattern B
k6 run load-tests/event-projection-k6.js \
  -e K6_VU=30 \
  -e K6_DURATION=10m \
  --out json=results/projection-sustained.json

# Pattern C
k6 run load-tests/batch-replication-k6.js \
  -e K6_VU=30 \
  -e K6_DURATION=10m \
  --out json=results/batch-sustained.json
```

### Phase 4: Spike Test (2 min per pattern)

```bash
# Pattern A
k6 run load-tests/api-direct-k6.js \
  -e K6_VU=50 \
  -e K6_DURATION=2m \
  --out json=results/api-spike.json

# Pattern B
k6 run load-tests/event-projection-k6.js \
  -e K6_VU=50 \
  -e K6_DURATION=2m \
  --out json=results/projection-spike.json

# Pattern C
k6 run load-tests/batch-replication-k6.js \
  -e K6_VU=50 \
  -e K6_DURATION=2m \
  --out json=results/batch-spike.json
```

### Phase 5: Failure Scenario (Pattern A only)

```bash
# Start baseline load
k6 run load-tests/api-direct-k6.js \
  -e K6_VU=20 \
  -e K6_DURATION=5m \
  --out json=results/api-failure-before.json &

# After 30s, stop Client service
sleep 30
docker-compose stop client-service

# Continue test for 2 more minutes (client service is down)
# k6 will show increased failures

# After 2 minutes, restart Client service
sleep 120
docker-compose start client-service

# Let test continue to observe recovery
wait
```

---

## Analyzing Results

### Export Prometheus Data

```bash
# Query Prometheus for metrics in time range
curl 'http://localhost:9090/api/v1/query_range' \
  --data-urlencode 'query=histogram_quantile(0.95, api_latency)' \
  --data-urlencode 'start=2024-01-15T10:00:00Z' \
  --data-urlencode 'end=2024-01-15T11:00:00Z' \
  --data-urlencode 'step=60s' | jq . > results/api_p95_latency.json
```

### Normalize Smoke and k6 Results

```bash
npm run results:export
```

Output: normalized JSON and CSV files in `results/analysis/` with a shared schema for smoke and k6 runs.

The exporter scans the raw JSON files in `results/`, including the smoke sample and the phase-specific k6 outputs such as `api-baseline.json`, `projection-ramp.json`, and `batch-spike.json`.

### Generate Summary Report

Create a Python script to aggregate results:

```python
import json
import pandas as pd

# Load k6 results
with open('results/api-baseline.json') as f:
    api_data = json.load(f)

# Extract metrics
metrics = api_data.get('metrics', {})
latency = metrics.get('api_latency', {})
success_rate = metrics.get('api_success', {})

print("Pattern A: Direct API")
print(f"  Latency p95: {latency.get('p95')} ms")
print(f"  Success rate: {success_rate.get('count')} requests")
```

---

## Key Observations

### Pattern A: Direct API

**Metrics to monitor**:
- Request latency (should increase as VU increases)
- Error rate (when Client service is down)
- API call count (direct dependency on workload)

**Expected behavior**:
- Baseline (10 VU): 20-50ms p95 latency
- Sustained (30 VU): 100-300ms p95 latency
- Spike (50 VU): 500ms+ latency or timeout
- Failure: 100% error rate when Client down

### Pattern B: Event-Driven

**Metrics to monitor**:
- Read latency (should be <5ms, independent of workload)
- Projection lag (freshness - should be <5s normally)
- Stale reads (% of reads getting outdated data)

**Expected behavior**:
- Baseline: 1-3ms read latency, <100ms projection lag
- Sustained: Same latency, may see increased lag if updates pile up
- Recovery: Quick return to normal latency after failure

### Pattern C: Batch Replication

**Metrics to monitor**:
- Read latency (should be 0.5-2ms, lowest of all)
- Batch age (freshness - 30s ± 5s)
- No dependency on Client service

**Expected behavior**:
- All phases: Consistent 0.5-2ms read latency
- Freshness: Sawtooth pattern (increases until batch sync, then resets)
- No impact from Client service failure

---

## Troubleshooting

### Services not starting

```bash
docker-compose logs
docker-compose down -v
docker-compose up -d
```

### Kafka consumer lag

Check consumer state:
```bash
docker-compose logs orders-projection-consumer
```

Reset consumer offset:
```bash
docker exec kafka kafka-consumer-groups \
  --bootstrap-server kafka:9092 \
  --group orders-projection-group \
  --reset-offsets --to-earliest --execute
```

### k6 test failures

```bash
# Check if Orders service is running
curl http://localhost:3002/health

# View service logs
docker-compose logs orders-service

# Verify data exists
curl http://localhost:3002/orders
```

### Metrics not appearing in Prometheus

```bash
# Check if services are exposing metrics
curl http://localhost:3001/metrics
curl http://localhost:3002/metrics

# Check Prometheus targets
# Visit http://localhost:9090/targets
```

---

## Cleanup

```bash
# Stop all services
docker-compose down

# Remove volumes (including data)
docker-compose down -v

# Remove images (optional)
docker rmi data-mesh-study_*
```
