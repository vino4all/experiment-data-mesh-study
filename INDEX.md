# Data Mesh Consistency Study - Complete Index

> Public-release note: use `docs/evidence-classification.md` and
> `docs/result-provenance.md` as the authoritative claim boundary. API
> dependency and recovery validation are supported evidence. Batch validation is
> descriptive pre-convergence evidence only, SLA compliance is invalidated for
> comparative claims, and hybrid output is exploratory.

## 📁 Project Structure

```
experiment-data-mesh-study/
├── docker-compose.yml                 # Full stack orchestration
├── package.json                       # Root workspace config
├── .env.example                       # Environment variables template
│
├── services/                          # 4 Node.js microservices
│   ├── client-service/                # Client domain (API + events)
│   ├── orders-service/                # Orders domain (3 patterns)
│   ├── orders-projection-consumer/    # Pattern B consumer
│   └── batch-sync-worker/             # Pattern C sync worker
│
├── db/                                # Database initialization
│   ├── client-init.sql               # Client domain schema
│   └── orders-init.sql               # Orders domain schema (all patterns)
│
├── load-tests/                        # k6 load testing scripts
│   ├── api-direct-k6.js              # Pattern A tests
│   ├── event-projection-k6.js        # Pattern B tests
│   ├── batch-replication-k6.js       # Pattern C tests
│   └── mixed-workload-k6.js          # Combined pattern tests
│
├── infra/                             # Monitoring infrastructure
│   ├── prometheus/
│   │   └── prometheus.yml            # Scrape configuration
│   └── grafana/
│       ├── dashboards.yml            # Dashboard provisioning
│       ├── datasources.json          # Prometheus datasource
│       └── dashboards/
│           └── data-mesh-dashboard.json  # Main dashboard
│
├── scripts/                           # Utility scripts
│   ├── seed-data.sh                  # Populate test data
│   ├── export-results.sh             # Normalize smoke and k6 results
│   └── export-results.js             # Cross-platform analysis exporter
│
├── docs/                              # Documentation
│   ├── README.md                     # Quick start guide
│   ├── architecture.md               # Detailed architecture & data flows
│   ├── experiment-design.md          # Experimental methodology
│   ├── running-experiments.md        # Step-by-step experiment guide
│   └── ieee-paper-draft.md           # Paper: Abstract, Intro, Related Work
│
├── results/                           # Output directory (created on first run)
│   ├── *.json                       # Raw smoke and phase outputs
│   └── analysis/                    # Unified analysis artifacts
│
└── PROJECT_SUMMARY.md                 # This document + next steps
```

## 🚀 Quick Start (5 minutes)

```bash
# 1. Navigate to project
cd experiment-data-mesh-study

# 2. Setup
cp .env.example .env
docker-compose build

# 3. Start services (wait 30s for health checks)
docker-compose up -d

# 4. Verify health
curl http://localhost:3001/health    # Client Service
curl http://localhost:3002/health    # Orders Service

# 5. Seed test data
bash scripts/seed-data.sh

# 6. Access dashboards
# Grafana: http://localhost:3000 (admin/admin)
# Prometheus: http://localhost:9090
# Kafka UI: http://localhost:8080
```

## 📖 Documentation Map

### For Understanding the Architecture
→ **Read first**: `docs/architecture.md`
- Detailed data flow for all three patterns
- Diagram of system components
- Synchronization state tracking
- Error handling and recovery

### For Understanding the Experiment
→ **Read next**: `docs/experiment-design.md`
- Research questions (RQ1-RQ4)
- Experimental phases (baseline, ramp, sustained, spike, failure)
- Metrics definitions and collection
- Success criteria and hypotheses
- Repeatability guidelines

### For Running the Experiment
→ **Follow**: `docs/running-experiments.md`
- Step-by-step commands for each phase
- Prometheus data extraction
- Result analysis scripts
- Troubleshooting guide

### For Writing the Paper
→ **Start with**: `docs/ieee-paper-draft.md`
- Abstract ✓
- Introduction ✓
- Related Work ✓
- Template for remaining sections
- Decision framework (to be filled in with results)

## 🔍 Understanding the Three Patterns

### Pattern A: Direct API Consumption
**Where**: `services/orders-service/src/index.js` line 25
```
GET /orders/:id/api-pattern
→ Calls Client API at request time
→ Freshness: Real-time (0ms)
→ Latency: 50-500ms (network dependent)
→ Coupling: Tight (runtime dependency)
```

### Pattern B: Event-Driven Projection
**Where**: `services/orders-projection-consumer/src/index.js` (consumer) + `services/orders-service/src/index.js` line 57 (read endpoint)
```
Event flow: Client update → Kafka → Consumer → Projection table
GET /orders/:id/projection-pattern
→ Reads from local projection
→ Freshness: <5s lag (event processing)
→ Latency: 1-10ms (local read)
→ Coupling: Loose (async, can replay)
```

### Pattern C: Batch Replication
**Where**: `services/batch-sync-worker/src/index.js` (sync) + `services/orders-service/src/index.js` line 89 (read endpoint)
```
Scheduled: Every 30s, Client → Orders batch table
GET /orders/:id/batch-pattern
→ Reads from batch ODS
→ Freshness: ~30s lag (batch interval)
→ Latency: 0.5-2ms (local read)
→ Coupling: None (full decoupling)
```

## 📊 Metrics Being Measured

### Prometheus Metrics (Real-time)
- `api_latency` - Direct API call duration
- `projection_latency` - Local projection read
- `batch_latency` - Local ODS read
- `data_freshness_lag_ms` - Time between update and visibility
- `stale_reads_total` - Count of outdated reads
- `batch_sync_duration_ms` - Sync cycle time

### k6 Custom Metrics
- `api_latency` - HTTP request latency (Pattern A)
- `projection_latency` - HTTP request latency (Pattern B)
- `batch_latency` - HTTP request latency (Pattern C)
- `projection_lag_ms` - Lag between event and projection
- `staleness_distribution` - Distribution of stale data age
- `replication_age_distribution` - Batch ODS age distribution

## 📝 Paper Sections Status

| Section | Status | Location |
|---------|--------|----------|
| Abstract | ✅ Complete | ieee-paper-draft.md |
| 1. Introduction | ✅ Complete | ieee-paper-draft.md |
| 2. Related Work | ✅ Complete | ieee-paper-draft.md |
| 3. Problem Statement | ✅ Complete | ieee-paper-draft.md |
| 4. Experimental Platform | ⏳ Template | ieee-paper-draft.md |
| 5. Methodology | ⏳ Template | PROJECT_SUMMARY.md |
| 6. Results | ⏳ Needs data | PROJECT_SUMMARY.md |
| 7. Discussion & Framework | ⏳ Needs data | PROJECT_SUMMARY.md |
| 8. Conclusion | ⏳ Needs data | PROJECT_SUMMARY.md |

## 🧪 Experimental Phases

Run in order with 5-10 min breaks between:

1. **Baseline** (5 min each)
   ```bash
   k6 run load-tests/api-direct-k6.js -e K6_VU=10 -e K6_DURATION=5m
   k6 run load-tests/event-projection-k6.js -e K6_VU=10 -e K6_DURATION=5m
   k6 run load-tests/batch-replication-k6.js -e K6_VU=10 -e K6_DURATION=5m
   ```

2. **Load Ramp** (5 min each, 20 VU)
3. **Sustained Load** (10 min each, 30 VU)
4. **Spike Test** (2 min each, 50 VU)
5. **Failure Scenario** (5 min, stop Client service mid-test)

Results saved to `results/` directory in JSON format.

## 🎯 Key Questions to Answer

**RQ1**: How do patterns differ in freshness, latency, throughput?
- Answer will come from Phase 1-4 results

**RQ2**: What is API pressure and coupling impact of Pattern A?
- Answer from latency under load + failure scenario

**RQ3**: What operational complexity does Pattern B add?
- Answer from consumer lag metrics + replay behavior

**RQ4**: Can hybrid approach balance all factors?
- Answer from combined pattern testing + decision framework

## 🛠️ Services Overview

### Client Service (3001)
- GET `/clients` - List all clients
- POST `/clients` - Create client (emits event)
- PUT `/clients/:id` - Update client (emits event)
- Emits to: Kafka topic `client-events`

### Orders Service (3002)
- Three parallel endpoints for same order
  - `/orders/:id/api-pattern` (Pattern A)
  - `/orders/:id/projection-pattern` (Pattern B)
  - `/orders/:id/batch-pattern` (Pattern C)
- POST `/orders` - Create order
- GET `/orders` - List orders
- All expose `/metrics` for Prometheus

### Projection Consumer (3003)
- Listens to Kafka topic `client-events`
- Updates `orders_client_projection` table
- Tracks consumer offset for replay
- Implements idempotency

### Batch Sync Worker (3004)
- Runs every 30s (configurable)
- Reads from Client DB
- Writes to Orders ODS table
- Tracks sync state for recovery

## 📈 Dashboard Visualization

Pre-built Grafana dashboard shows:
- Latency comparison (p95) for all patterns
- Data freshness lag over time
- Stale reads by pattern
- Batch sync throughput
- Request success rates

Access at: http://localhost:3000

## 🔧 Common Tasks

### View service logs
```bash
docker-compose logs -f client-service
docker-compose logs -f orders-projection-consumer
```

### Check Kafka topics
```bash
docker exec kafka kafka-topics --bootstrap-server localhost:9092 --list
docker exec kafka kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic client-events --from-beginning
```

### Query Prometheus directly
```bash
curl 'http://localhost:9090/api/v1/query?query=api_latency'
```

### Stop everything and reset
```bash
docker-compose down -v
rm -rf results/
```

## 📋 Checklist Before Running Experiments

- [ ] Services all healthy (`curl localhost:300X/health`)
- [ ] Seed data populated (`curl localhost:3001/clients`)
- [ ] Results directory exists (`mkdir -p results`)
- [ ] k6 installed (`k6 --version`)
- [ ] Grafana dashboard accessible (http://localhost:3000)
- [ ] Prometheus scraping metrics (http://localhost:9090/targets)
- [ ] Kafka topic visible in Kafka UI (http://localhost:8080)

## 💾 Output Files After Running

- `results/api-*.json` - k6 results from Pattern A tests
- `results/projection-*.json` - k6 results from Pattern B tests
- `results/batch-*.json` - k6 results from Pattern C tests
- `results/*-metrics.csv` - Exported Prometheus metrics
- Grafana dashboards auto-populate from Prometheus

## 🎓 Learning Path

If new to this architecture:

1. Read: `README.md` (quick overview)
2. Read: `docs/architecture.md` (understand patterns)
3. Run: `docker-compose up -d` (start platform)
4. Explore: Grafana + Prometheus dashboards (see real metrics)
5. Run: First baseline test (see k6 output)
6. Read: `docs/experiment-design.md` (understand methodology)
7. Read: `docs/ieee-paper-draft.md` (understand paper structure)
8. Write: Paper sections based on experimental results

## 📚 References

- Data Mesh concepts: See Related Work section in paper
- Kafka: https://kafka.apache.org/documentation/
- k6: https://k6.io/docs/
- Prometheus: https://prometheus.io/docs/
- IEEE paper template: Should follow IEEE format for target conference

## 🚦 Next Immediate Steps

1. **Run baseline experiment** (20 min total)
   ```bash
   # Follow docs/running-experiments.md Phase 1
   ```

2. **Capture metrics** (automatic)
   - Prometheus stores in `prometheus_data` volume
   - k6 outputs JSON to `results/`

3. **Draft Results section** (1-2 hours)
   - Use templates in `docs/ieee-paper-draft.md`
   - Fill with actual data from experiments

4. **Write Discussion & Decision Framework** (2-3 hours)
   - Answer RQ1-RQ4 with quantified findings
   - Create comparison table from results

5. **Polish paper** (1 hour)
   - Check citations, formatting
   - Align with target conference style

---

**Total effort to completion**: 6-10 hours from now to submitted IEEE paper

**Start**: Run the quick start commands above, then follow `docs/running-experiments.md`
