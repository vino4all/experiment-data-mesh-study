# Experiment Design and Methodology

> Public-release note: this file documents the platform design and original
> workload plan. The accepted-paper evidence boundary is defined in
> `docs/evidence-classification.md`; batch interval comparison, SLA comparison,
> and hybrid superiority claims are not supported by the archived final data.

## Overview

This document describes the experimental design for evaluating three cross-domain data-sharing patterns in Data Mesh architectures.

## Experimental Variables

### Independent Variables

1. **Synchronization Pattern**
   - Pattern A: Direct API Consumption
   - Pattern B: Event-Driven Projection
   - Pattern C: Batch Data Product Replication

2. **Load Profile**
   - VU (Virtual Users): 10, 20, 30, 50
   - Duration: 60s per pattern at each VU level
   - Request distribution: Uniform across order lookups

3. **Update Frequency** (for patterns B and C)
   - Event rate: Variable based on load
   - Batch interval: 30s (Pattern C)
   - Kafka consumer lag: Observed metric

### Dependent Variables

#### Performance Metrics
- **Read Latency** (ms): p50, p95, p99
- **Throughput** (requests/sec)
- **Error Rate** (%): Failed requests / Total requests

#### Consistency Metrics
- **Data Freshness Lag** (ms): Time between update and visibility
- **Stale Read Count**: Reads returning outdated data
- **Update-to-Read Latency**: Time from event generation to first read

#### Operational Metrics
- **API Call Pressure**: Requests/sec to upstream services
- **Consumer Lag** (Pattern B): Kafka offset lag in messages
- **Batch Sync Duration** (Pattern C): Total time per sync cycle
- **Resource Utilization** (CPU, Memory, Network)

## Experimental Phases

### Phase 1: Baseline (5 minutes per pattern)
- Low load: 10 VUs
- Measure steady-state behavior
- Establish baseline latency and freshness

### Phase 2: Load Ramp (5 minutes per pattern)
- Increase VUs from 10 → 30
- Measure sensitivity to load
- Observe pattern behavior under increasing pressure

### Phase 3: Sustained Load (10 minutes per pattern)
- Maintain 30 VUs
- Measure behavior stability
- Detect any performance degradation over time

### Phase 4: Spike Test (2 minutes per pattern)
- Sudden increase: 30 → 50 VUs
- Measure recovery after spike
- Observe queue depth and latency spike

### Phase 5: Failure Scenario (5 minutes per pattern A)
- Stop Client service
- Measure impact on Orders service
- Observe timeout behavior and circuit breaking (if implemented)

### Phase 6: Recovery (5 minutes after failure)
- Restart Client service
- Measure recovery time
- Measure queued request handling

## Success Criteria

### Pattern A: Direct API
- ✓ Read latency p95 < 500ms
- ✓ Success rate > 99%
- ✓ Realtime freshness (< 100ms lag)
- ✗ Runtime coupling (by design)

### Pattern B: Event-Driven Projection
- ✓ Read latency p95 < 100ms
- ✓ Success rate > 99.5%
- ✓ Projection lag < 5s (under normal conditions)
- ✓ Stale reads < 0.1% of total reads

### Pattern C: Batch Replication
- ✓ Read latency p95 < 50ms
- ✓ Success rate > 99.9%
- ✓ No runtime dependency on Client service
- ✓ Batch duration < 5s for full sync

## Measurement Instrumentation

### Prometheus Metrics
- HTTP request latency (histograms)
- API call counts (counters)
- Data freshness lag (gauges)
- Stale read counts (counters)
- Batch sync duration (histograms)

### k6 Custom Metrics
- Pattern-specific latencies
- Success/failure rates
- Custom freshness calculations

### Application Logs
- Event processing timestamps
- Kafka offset tracking
- Batch sync progress

## Data Collection

### Metrics Collection Frequency
- Prometheus scrape interval: 15s
- k6 metric emission: Real-time
- Log aggregation: Continuous

### Result Export
- Prometheus query range: Full experiment duration
- k6 JSON output: Per test run
- Grafana dashboards: Real-time visualization
- CSV export: Post-processing

## Statistical Analysis

### Aggregation
- **Latency**: Calculate p50, p95, p99, mean, stdev
- **Throughput**: Calculate RPS, success rate
- **Freshness**: Calculate mean lag, max lag, distribution
- **Stale Reads**: Calculate percentage and rate

### Comparison
- ANOVA for latency differences between patterns
- Effect size (Cohen's d) for meaningful differences
- 95% confidence intervals for point estimates

## Hypotheses (from research plan)

### H1: Direct API Consumption
**Claim**: Direct API provides freshest data but creates high runtime dependency.

**Measurement**: 
- Freshness < 100ms (real-time)
- Client service unavailability → 100% Orders service failure
- Throughput limited by Client API capacity

### H2: Event-Driven Projection
**Claim**: Event-driven reduces API pressure while maintaining good freshness.

**Measurement**:
- Freshness 100ms-5s (lag depends on processing)
- No direct dependency (consumer can replay)
- Throughput independent of Client service load

### H3: Batch Data Product Replication
**Claim**: Batch provides strongest decoupling but largest freshness lag.

**Measurement**:
- Freshness 30s+ (batch interval dependent)
- Complete runtime decoupling
- Lowest read latency (local query only)

### H4: Hybrid Pattern
**Claim**: Combining patterns provides balanced architecture.

**Measurement**:
- Real-time lookups use API (H1)
- Batch enrichment uses replication (H3)
- Balanced freshness and throughput

## Threat to Validity

### Internal Validity
- **Confounding**: Run tests serially, same seed data, isolated platform
- **History effects**: Keep tests short, no external changes during runs
- **Instrumentation**: Fixed metrics definitions across patterns

### External Validity
- **Generalization**: Results specific to this data model and workload
- **Scale**: Small number of records/messages (100 clients, 1000 orders)
- **Real-world complexity**: Simplified schema, no complex joins

### Construct Validity
- **Measurement**: Metrics mapped directly to research questions
- **Definitions**: Latency = time from request to response, Freshness = time from event to visibility

## Repeatability

To repeat this experiment:

1. Check out code from git
2. Run `docker-compose build` to build images
3. Run `docker-compose up -d` to start platform
4. Wait 30s for services to be healthy
5. Run seed-data.sh to populate initial data
6. Run k6 tests: `k6 run load-tests/api-direct-k6.js`
7. Export Prometheus metrics
8. Analyze results with scripts/export-results.sh
