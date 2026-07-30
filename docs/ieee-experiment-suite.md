# IEEE Experiment Suite Automation

> Public-release note: this historical suite description is retained for
> reproducibility context. For the public artifact, use
> `docs/result-provenance.md` and `docs/evidence-classification.md` as the
> authoritative mapping from result files to supported claims.

This repository now includes an end-to-end experiment runner for the five remaining IEEE experiments.

## Run Command

```bash
npm run experiments:ieee
```

On Windows hosts that already run PostgreSQL on 5432, this project publishes `client-db` on host port `55432` by default. The runner already defaults to that port (`CLIENT_DB_PORT=55432`).

## What It Produces

### Experiment Outputs

- `results/failure_recovery_results.json`
- `results/failure_recovery_results.csv`
- `results/batch_interval_comparison.csv`
- `results/update_storm_results.json`
- `results/update_storm_results.csv`
- `results/api_dependency_degradation.csv`
- `results/hybrid_comparison_results.csv`

### Normalized Results Schema

- `results/analysis/ieee-normalized-results.csv`
- `results/analysis/ieee-normalized-results.json`

Columns:

- `experiment_name`
- `pattern`
- `phase`
- `timestamp`
- `sample_count`
- `mean_latency_ms`
- `p50_latency_ms`
- `p95_latency_ms`
- `p99_latency_ms`
- `mean_freshness_lag_ms`
- `p50_freshness_lag_ms`
- `p95_freshness_lag_ms`
- `p99_freshness_lag_ms`
- `stale_read_rate`
- `throughput`
- `error_rate`
- `recovery_duration_ms`

### Charts (PNG)

- `results/charts/freshness-lag-comparison.png`
- `results/charts/stale-read-comparison.png`
- `results/charts/throughput-comparison.png`
- `results/charts/recovery-duration-comparison.png`
- `results/charts/api-dependency-impact.png`
- `results/charts/client-api-delay-vs-orders-latency.png`
- `results/charts/batch-interval-vs-freshness-lag.png`
- `results/charts/hybrid-strategy-comparison.png`

### Paper Tables

- `paper/tables/table-1-pattern-comparison.csv`
- `paper/tables/table-1-pattern-comparison.md`
- `paper/tables/table-2-freshness-metrics.csv`
- `paper/tables/table-2-freshness-metrics.md`
- `paper/tables/table-3-recovery-metrics.csv`
- `paper/tables/table-3-recovery-metrics.md`
- `paper/tables/table-4-api-dependency-metrics.csv`
- `paper/tables/table-4-api-dependency-metrics.md`
- `paper/tables/table-5-hybrid-strategy-metrics.csv`
- `paper/tables/table-5-hybrid-strategy-metrics.md`

## Failure Injection Controls

- Client API latency/failure injection: `POST /control/failure-injection` on client service
- Projection consumer pause/resume: `POST /control/pause`, `POST /control/resume`
- Projection consumer hard stop/start: Docker container control in script
- Batch delay injection: `POST /control/delay`
- Batch run trigger: `POST /control/run-once`

## Freshness Metric Fix

Freshness now records:

- `source_update_timestamp`
- `visible_timestamp`
- `freshness_lag_ms = visible_timestamp - source_update_timestamp`

This is written to projection and batch synchronization paths and persisted in `synchronization_visibility_events`.

## Optional Runtime Scaling

For faster local runs, use env variables:

- `EXP1_CLIENT_UPDATES`, `EXP1_READ_REQUESTS`
- `EXP2_CLIENT_UPDATES`, `EXP2_READ_REQUESTS`, `EXP2_INTERVAL_SCALE_SECONDS`
- `EXP3_CLIENT_UPDATES`, `EXP3_ORDER_READS`, `EXP3_RUN_MINUTES`
- `EXP4_READ_REQUESTS`
- `EXP5_READ_REQUESTS`
- `EXPERIMENT_CONCURRENCY`
