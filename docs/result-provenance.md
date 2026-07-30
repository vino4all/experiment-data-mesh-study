# Result Provenance

## API Dependency

| Reported result | Source script | Command | Configuration | Result file | Calculation method | Evidence class | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 497 ms p95 latency at 0 ms delay | `scripts/run-final-validation-experiments.js`, experiment D | `npm run experiments:final` | `api-pattern`, 100 concurrency, 30000 requests, no injected delay | `results/final/api_dependency/api_dependency_matrix.csv` | p95 over successful Orders-service request latencies | SUPPORTED descriptive | Single-run treatment observation |
| 2159 ms p95 latency at 2000 ms delay | `scripts/run-final-validation-experiments.js`, experiment D | `npm run experiments:final` | `api-pattern`, 100 concurrency, 30000 requests, 2000 ms upstream delay | `results/final/api_dependency/api_dependency_matrix.csv` | p95 over successful Orders-service request latencies | SUPPORTED descriptive | Single-run treatment observation |
| 345.5 requests/s at 0 ms delay | `scripts/run-final-validation-experiments.js`, experiment D | `npm run experiments:final` | 100 concurrency, 30000 requests, no injected delay | `results/final/api_dependency/api_dependency_matrix.csv` | request count divided by elapsed wall-clock seconds | SUPPORTED descriptive | Single-run treatment observation |
| 48.5 requests/s at 2000 ms delay | `scripts/run-final-validation-experiments.js`, experiment D | `npm run experiments:final` | 100 concurrency, 30000 requests, 2000 ms upstream delay | `results/final/api_dependency/api_dependency_matrix.csv` | request count divided by elapsed wall-clock seconds | SUPPORTED descriptive | Single-run treatment observation |

Errors are tracked separately as `error_rate` and `timeout_rate`; failed
requests are not included in the successful-response latency distribution.

## Recovery Validation

| Reported result | Source script | Command | Configuration | Result file | Calculation method | Evidence class | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 independent trials | `scripts/run-final-validation-experiments.js`, experiment C | `npm run experiments:final` | `FINAL_RECOVERY_TRIALS=10` default | `results/final/recovery_validation/recovery_trials.csv` | one row per reset-and-reseed trial | SUPPORTED replicated | Local Docker environment |
| 10000-event backlog | same | same | `FINAL_RECOVERY_UPDATES=10000` default | `recovery_trials.csv`, `recovery_summary.csv` | update count and backlog-size polling | SUPPORTED replicated | Backlog generated synthetically |
| 12125.7 ms mean recovery duration | same | same | ten trials | `recovery_summary.csv` | arithmetic mean of trial recovery durations | SUPPORTED replicated | Host resource contention can affect timing |
| 12073.29 to 12178.11 ms 95 percent CI | same | same | ten trials | `recovery_summary.csv` | normal-approximation 95 percent CI | SUPPORTED replicated | Small sample size |
| 824.73 events/s catch-up rate | same | same | 10000 updates per trial | `recovery_summary.csv` | updates divided by recovery duration | SUPPORTED replicated | Synthetic workload |
| 0.008895 stale-read rate | same | same | 20000 reads default | `recovery_summary.csv` | stale reads divided by read count | SUPPORTED replicated | Denominator is the configured read count, not only impacted-order reads |

## Batch Validation

| Reported result | Source script | Command | Configuration | Result file | Calculation method | Evidence class | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Archived interval-labeled freshness rows | `scripts/run-final-validation-experiments.js`, experiment A | `npm run experiments:final` | Intended labels 1, 5, 15, and 30 minutes | `results/final/batch_validation/*` | descriptive stale-read and freshness summaries | DESCRIPTIVE pre-convergence | Interval labels were not passed to the active batch worker |

The active worker reads `BATCH_SYNC_INTERVAL_MS` at startup and exposes
`/control/run-once`; the archived runner did not configure a separate active
worker interval for each treatment. These files must not be presented as valid
interval-comparison results.

## SLA Compliance

| Reported result | Source script | Command | Configuration | Result file | Calculation method | Evidence class | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Archived SLA compliance summaries | `scripts/run-final-validation-experiments.js`, experiment B | `npm run experiments:final` | SLA thresholds 1000 to 900000 ms | `results/final/sla_compliance/*` | percentage of reads meeting threshold | INVALIDATED FOR COMPARATIVE CLAIMS | Reused prior state and did not generate matched fresh updates |

## Hybrid

| Reported result | Source script | Command | Configuration | Result file | Calculation method | Evidence class | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Archived hybrid score | `scripts/run-final-validation-experiments.js`, experiment E | `npm run experiments:final` | sequential API, projection, batch, and hybrid reads | `results/final/hybrid/*` | weighted normalized score over latency, throughput, freshness, recovery, and API-call components | EXPLORATORY | Sequential execution and inherited state; no superiority claim |
