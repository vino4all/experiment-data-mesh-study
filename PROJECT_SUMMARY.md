# Project Summary: Data Mesh Consistency Study

> Public-release note: the authoritative evidence classification is in
> `docs/evidence-classification.md`. Do not use archived batch interval, SLA, or
> hybrid files as primary comparative evidence.

## Completed Deliverables

### ✅ Phase 1: Experimental Platform (100% Complete)

**Docker Infrastructure**
- `docker-compose.yml`: Full stack with 10 services
  - PostgreSQL (Client & Orders domains)
  - Kafka + Zookeeper + Kafka UI
  - Prometheus + Grafana
  - 4 Node.js services

**Services Implemented**
- **Client Service** (3001): REST API for client CRUD, emits Kafka events
- **Orders Service** (3002): Three parallel endpoints for pattern comparison
  - Pattern A: `/orders/:id/api-pattern` - Direct API calls
  - Pattern B: `/orders/:id/projection-pattern` - Read from projection
  - Pattern C: `/orders/:id/batch-pattern` - Read from batch ODS
- **Projection Consumer** (3003): Kafka consumer updating projection table
- **Batch Sync Worker** (3004): 30s periodic batch sync from Client → Orders

**Databases & Schema**
- `db/client-init.sql`: Client domain schema with event log
- `db/orders-init.sql`: Orders domain schema with projection + batch tables
- Seed data: 5 clients, 5 orders pre-populated

**Monitoring**
- Prometheus scrape config for all services
- Grafana dashboard: Latency, freshness, stale reads, throughput
- Kafka UI for topic inspection

**Load Testing** (k6)
- `api-direct-k6.js`: Pattern A load test (10 VU, 60s default)
- `event-projection-k6.js`: Pattern B load test (measures freshness)
- `batch-replication-k6.js`: Pattern C load test (measures ODS lag)
- `mixed-workload-k6.js`: Combined test with weighted distribution

**Documentation**
- `README.md`: Quick start, API endpoints, metrics overview
- `docs/architecture.md`: Detailed data flow diagrams for all three patterns
- `docs/experiment-design.md`: Experimental methodology, phases, success criteria
- `docs/running-experiments.md`: Step-by-step experiment execution guide

**Scripts**
- `scripts/seed-data.sh`: Populate initial test data
- `scripts/export-results.sh`: Extract k6 results to CSV

### Platform Statistics

| Component | Count | Files |
|-----------|-------|-------|
| Docker services | 10 | 1 compose file |
| Microservices | 4 | 16 source files |
| Database tables | 8 | 2 init scripts |
| Load tests | 4 | 4 k6 scripts |
| Configuration files | 8 | 8 files |
| Documentation | 4 | 4 markdown files |
| **Total** | **39** | **43 files** |

---

## Next Steps: Paper Writing (Phase 2 & 3)

### Remaining IEEE Paper Sections

**Already Written** (docs/ieee-paper-draft.md):
- Abstract ✓
- 1. Introduction ✓
- 2. Related Work ✓
- 3. Problem Statement ✓
- 4. (Partial) Experimental Platform

**Still Needed**:

#### 4. Experimental Platform & Patterns (Detailed)

Write detailed technical description of each pattern:
- Pattern A: Direct API (diagram, timing, failure modes)
- Pattern B: Event-Driven (idempotency, replay, offset tracking)
- Pattern C: Batch Replication (sync state machine, upsert logic)

**Outline**:
```
4.1 Platform Overview
4.2 Shared Infrastructure (Databases, Kafka, Monitoring)
4.3 Pattern A: Direct API Consumption
  4.3.1 Architecture and flow
  4.3.2 Implementation details
  4.3.3 Failure modes
4.4 Pattern B: Event-Driven Projection
  4.4.1 Architecture and flow
  4.4.2 Idempotency and replay
  4.4.3 Consumer state tracking
4.5 Pattern C: Batch Replication
  4.5.1 Architecture and flow
  4.5.2 Sync state machine
  4.5.3 Partial failure recovery
4.6 Measurement Instrumentation
```

#### 5. Methodology

**Outline**:
```
5.1 Research Questions (RQ1-RQ4 from introduction)
5.2 Experimental Design
  5.2.1 Independent variables (pattern, load, workload mix)
  5.2.2 Dependent variables (freshness, latency, throughput, coupling)
5.3 Experimental Phases
  5.3.1 Baseline (10 VU, 5 min per pattern)
  5.3.2 Load Ramp (10→30 VU, 5 min)
  5.3.3 Sustained Load (30 VU, 10 min)
  5.3.4 Spike Test (30→50 VU, 2 min)
  5.3.5 Failure Recovery (Client service restart)
5.4 Metrics and Measurement
  5.4.1 Latency (p50, p95, p99)
  5.4.2 Data Freshness (event lag, projection age)
  5.4.3 API Pressure (requests/sec to upstream)
  5.4.4 Stale Reads (% outdated responses)
5.5 Statistical Analysis Method
  5.5.1 Aggregation (means, percentiles)
  5.5.2 Comparative analysis (ANOVA, effect sizes)
  5.5.3 Confidence intervals
5.6 Instrumentation
  5.6.1 Prometheus metric export
  5.6.2 k6 JSON output
  5.6.3 Application logs
```

#### 6. Results

**Will be written after running experiments**

**Outline** (placeholder):
```
6.1 Data Freshness Comparison
  6.1.1 Pattern A: Real-time (0ms theoretical)
  6.1.2 Pattern B: Near real-time (measured lag)
  6.1.3 Pattern C: Batch interval (30s theoretical)
  6.1.4 Stale read incidents

6.2 Latency and Throughput
  6.2.1 Read latency by pattern
  6.2.2 Throughput under sustained load
  6.2.3 Impact of VU increase
  6.2.4 p95 and p99 latencies

6.3 API Pressure and Coupling
  6.3.1 Pattern A API call count
  6.3.2 Impact when Client service fails
  6.3.3 Recovery time
  
6.4 Event-Driven Complexity
  6.4.1 Projection lag distribution
  6.4.2 Consumer offset tracking
  6.4.3 Replay behavior

6.5 Batch Sync Characteristics
  6.5.1 Sync duration vs data volume
  6.5.2 Freshness sawtooth pattern
  6.5.3 Operational decoupling

6.6 Mixed Workload Results
  6.6.1 Performance with all patterns active
  6.6.2 Resource contention
  6.6.3 Ranking by different metrics
```

#### 7. Discussion

**Outline**:
```
7.1 Answering Research Questions
  7.1.1 RQ1: Tradeoff quantification
  7.1.2 RQ2: API pressure measurement
  7.1.3 RQ3: Operational complexity
  7.1.4 RQ4: Hybrid approach benefits

7.2 Decision Framework
  7.2.1 Freshness requirements → Pattern selection
  7.2.2 Workload characteristics → Pattern suitability
  7.2.3 Operational complexity tolerance
  7.2.4 Hybrid pattern combinations

7.3 Implications for Data Mesh
  7.3.1 Complexity relocation (not elimination)
  7.3.2 Governance implications
  7.3.3 Team organizational structure

7.4 Limitations
  7.4.1 Simplified scenario (2 domains, limited records)
  7.4.2 Synthetic workload vs real traffic
  7.4.3 Single machine Docker (no network latency)
  7.4.4 Specific technology stack (PostgreSQL, Kafka, Node.js)

7.5 Threats to Validity
  7.5.1 Internal (confounding factors)
  7.5.2 External (generalization)
  7.5.3 Construct (measurement definitions)

7.6 Recommendations for Practitioners
  7.6.1 When to use each pattern
  7.6.2 Monitoring and alerting
  7.6.3 Operational runbooks
```

#### 8. Conclusion

```
8.1 Summary of Contributions
8.2 Key Findings
8.3 Future Work
  8.3.1 More complex domains
  8.3.2 CDC-based replication
  8.3.3 Multi-datacenter scenarios
  8.3.4 Cost comparison
8.4 Final Thoughts on Data Mesh Operations
```

---

## Running the Platform Now

If you want to start collecting experimental data immediately:

```bash
cd experiment-data-mesh-study

# Setup
cp .env.example .env
docker-compose build
docker-compose up -d

# Verify services
curl http://localhost:3001/health
curl http://localhost:3002/health

# Seed data
bash scripts/seed-data.sh

# Run baseline test (Pattern A)
k6 run load-tests/api-direct-k6.js \
  -e K6_VU=10 -e K6_DURATION=5m \
  --out json=results/api-baseline.json

# View dashboard (open browser)
# http://localhost:3000  (Grafana)
# http://localhost:9090  (Prometheus)
```

After ~5 minutes, you'll have baseline metrics that can inform the Results section.

---

## Decision Framework Template (For Section 7.2)

After collecting results, fill in this table in the paper:

| Factor | Pattern A: API | Pattern B: Events | Pattern C: Batch |
|--------|---|---|---|
| **Freshness** | Immediate | <5s lag | 30s lag |
| **Read Latency** | 50-500ms | 1-10ms | 0.5-5ms |
| **Write Latency** | N/A | Event + sync | Batch + sync |
| **API Pressure** | HIGH (tight coupling) | LOW | NONE |
| **Runtime Coupling** | TIGHT | LOOSE | NONE |
| **Operational Complexity** | LOW | MEDIUM | MEDIUM |
| **Infrastructure Cost** | LOW (no storage) | MEDIUM | MEDIUM |
| **Best For** | Real-time reads | General purpose | Batch enrichment |
| **Avoid If** | High throughput | Need ACID | Need real-time |

---

## Writing Tips (Practitioner Style)

Based on your preference for practitioner writing:

1. **Lead with findings**: "We measured API latency at 500ms under sustained load" rather than "Our methodology for measuring latency involves..."
2. **Use short sections**: 2-3 sentences max per point
3. **Show data early**: Put key chart in Results intro
4. **Narrative stories**: "When we stopped the Client service, Pattern A failed immediately, but Pattern B continued" vs abstract description
5. **Honest limitations**: "Our Docker platform doesn't capture network latency between machines"
6. **Clear recommendations**: "Use Pattern A for order detail pages (freshness matters). Use Pattern C for overnight fulfillment."

---

## Files You Should Review First

If jumping into paper writing:

1. `docs/architecture.md` — Understand all three patterns deeply
2. `docs/experiment-design.md` — Know the methodology before writing it
3. `load-tests/*-k6.js` — See what metrics are actually being collected
4. Look at running platform locally and seeing metrics appear in Prometheus

---

## Estimated Effort

| Task | Estimated Time |
|------|---|
| Run Phase 1-4 experiments | 1-2 hours |
| Export and analyze results | 30 min |
| Write Results section (6) | 1-2 hours |
| Write Discussion & Decision Framework (7) | 2-3 hours |
| Write Conclusion (8) | 30 min |
| Polish entire paper | 1 hour |
| **Total** | **6-10 hours** |

---

## Contact & Questions

For questions about:
- **Platform setup**: See README.md and running-experiments.md
- **Architecture**: See docs/architecture.md
- **Methodology**: See docs/experiment-design.md
- **Paper structure**: See docs/ieee-paper-draft.md

Good luck with the research and writing!
