# Cross-Domain Data Synchronization Study

Reproducibility artifact for the IEEE conference paper "Experimental Evaluation
of Cross-Domain Data Synchronization Architectures Under Consistency and Failure
Constraints."

The artifact implements a Docker-based Client and Orders domain platform used
to evaluate direct API reads, event-driven projections, batch replication, and
hybrid routing under consistency and failure constraints.

## Evidence Boundary

Supported public findings:

- API dependency observations are supported descriptive evidence.
- Event-projection recovery is supported replicated evidence with ten
  reset-and-reseed trials.

Archived transparency artifacts:

- Batch-validation files are descriptive pre-convergence observations only. The
  archived interval labels were not applied to the active batch worker, so they
  must not be used as interval-comparison results.
- SLA-compliance files are invalidated for comparative SLA claims because the
  archived phase reused prior state and did not generate matched fresh updates.
- Hybrid files are exploratory because the archived phase executed sequentially
  and inherited prior state.

See `docs/evidence-classification.md` and `docs/result-provenance.md`.

## System Requirements

- Docker with Docker Compose v2
- Node.js 24 LTS
- Python 3 for `scripts/results_validator.py`
- k6 for optional load-test scripts

Tested runtime pins:

- Node container image: `node:24.16.0-alpine`
- PostgreSQL image: `postgres:15.18-alpine`
- Kafka image: `confluentinc/cp-kafka:7.5.0`
- Kafka UI image: `provectuslabs/kafka-ui:v0.7.2`
- Prometheus image: `prom/prometheus:v3.12.0`
- Grafana image: `grafana/grafana:13.0.2`

## Quick Start

```bash
cp .env.example .env
npm ci
docker compose up -d --build
npm run seed:data
npm run smoke
python scripts/results_validator.py
```

On Linux or WSL, the smoke wrapper starts the stack and runs the smoke checks:

```bash
./scripts/run-smoke-test.sh
```

On Windows PowerShell:

```powershell
.\scripts\run-smoke-test.ps1
```

The smoke test waits for health checks, seeds deterministic synthetic records,
performs one direct API read, publishes a client update through Kafka, verifies
projection convergence, runs one explicit batch synchronization, and writes
`results/smoke/smoke-result.json`.

## Full Experiment Commands

```bash
npm run experiments:final
python scripts/results_validator.py
```

The full archived suite can take hours depending on Docker host performance and
configured scale. Do not rerun the expensive suite unless you need to regenerate
the final result snapshots.

Optional k6 workloads:

```bash
npm run test:api
npm run test:event
npm run test:batch
npm run test:mixed
```

## Result Directory Map

- `results/final/api_dependency`: supported descriptive API dependency evidence.
- `results/final/recovery_validation`: supported replicated recovery evidence.
- `results/final/batch_validation`: descriptive pre-convergence evidence;
  interval comparison invalidated.
- `results/final/hybrid`: exploratory only.
- `results/final/sla_compliance`: invalidated for comparative SLA claims.

Each folder contains a local `README.md` describing status, source script, file
contents, and claim limitations.

## Security And Privacy

The stack is a local research environment, not a production deployment. Published
ports bind to `127.0.0.1`, Kafka uses plaintext transport inside the local Docker
network, and the services do not implement user authentication or authorization.
Do not expose this stack to an untrusted network.

Seed records are synthetic and use reserved `example.com` addresses, fictional
555 telephone numbers, fixed test UUIDs, and sample street addresses. Do not
replace them with production or personal data.

`.env` is ignored by Git. Use `.env.example` only as a template and set local
passwords before running Docker Compose.

## Artifact Provenance

The provenance document maps reported values to scripts, commands,
configuration, result files, calculation methods, evidence classes, and
limitations. The public release package includes source code, infrastructure,
documentation, validation scripts, and reviewed `results/final` artifacts.

## Known Limitations

- The batch interval comparison protocol is invalidated.
- SLA and hybrid archived phases are not valid comparative evidence.
- Timings are local Docker measurements and can shift with host CPU, storage,
  and memory contention.
- The workload and schema are synthetic and intentionally smaller than a
  production retail system.

## Citation

Use `CITATION.cff`. Final DOI, proceedings metadata, and ORCID values are left
as placeholders where they are not yet available.

## License

See `LICENSE`.

## Security Reporting

See `SECURITY.md`.
