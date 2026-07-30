# Public Release Audit

Repository: experiment-data-mesh-study
Artifact version: v1.0.0
Audit date: 2026-07-30
Paper: Experimental Evaluation of Cross-Domain Data Synchronization Architectures Under Consistency and Failure Constraints

## Summary

- Public release package created outside the repository under release-staging/experiment-data-mesh-study-v1.0.0/.
- No push, publication, GitHub repository creation, or commit was performed.
- This workspace is not currently a Git repository; git status, git ls-files, and Git history scanning are unavailable here.
- results/final is curated and labeled by evidence class.
- Local .env, archives, dependency folders, bytecode, generated paper files, and release staging output are excluded.

## Evidence Classification

- api_dependency: SUPPORTED descriptive evidence.
- recovery_validation: SUPPORTED replicated evidence.
- batch_validation: DESCRIPTIVE pre-convergence evidence; interval comparison invalidated.
- hybrid: EXPLORATORY only.
- sla_compliance: INVALIDATED FOR COMPARATIVE CLAIMS.

## Safe To Publish

The exact staged release inclusion list is:

- `.dockerignore`
- `.env.example`
- `.gitignore`
- `CHANGELOG.md`
- `CITATION.cff`
- `db\client-init.sql`
- `db\orders-init.sql`
- `docker-compose.yml`
- `docs\architecture.md`
- `docs\evidence-classification.md`
- `docs\experiment-design.md`
- `docs\ieee-experiment-suite.md`
- `docs\result-provenance.md`
- `docs\running-experiments.md`
- `INDEX.md`
- `infra\grafana\dashboards.yml`
- `infra\grafana\dashboards\data-mesh-dashboard.json`
- `infra\grafana\datasources.json`
- `infra\prometheus\prometheus.yml`
- `LICENSE`
- `load-tests\api-direct-k6.js`
- `load-tests\batch-replication-k6.js`
- `load-tests\event-projection-k6.js`
- `load-tests\mixed-workload-k6.js`
- `MANIFEST.sha256`
- `package.json`
- `package-lock.json`
- `PROJECT_SUMMARY.md`
- `PUBLIC_RELEASE_AUDIT.md`
- `README.md`
- `RELEASE_NOTES.md`
- `results\final\api_dependency\api_delay_vs_orders_latency.png`
- `results\final\api_dependency\api_delay_vs_throughput.png`
- `results\final\api_dependency\api_dependency_matrix.csv`
- `results\final\api_dependency\api_dependency_summary.csv`
- `results\final\api_dependency\README.md`
- `results\final\batch_validation\batch_interval_vs_freshness.png`
- `results\final\batch_validation\batch_validation_raw.csv`
- `results\final\batch_validation\batch_validation_stats.json`
- `results\final\batch_validation\batch_validation_summary.csv`
- `results\final\batch_validation\README.md`
- `results\final\hybrid\hybrid_comparison.csv`
- `results\final\hybrid\hybrid_scores.csv`
- `results\final\hybrid\pattern_comparison_bar.png`
- `results\final\hybrid\pattern_comparison_radar.png`
- `results\final\hybrid\README.md`
- `results\final\recovery_validation\README.md`
- `results\final\recovery_validation\recovery_duration_distribution.png`
- `results\final\recovery_validation\recovery_summary.csv`
- `results\final\recovery_validation\recovery_trials.csv`
- `results\final\sla_compliance\README.md`
- `results\final\sla_compliance\sla_compliance.csv`
- `results\final\sla_compliance\sla_compliance_by_sla_summary.csv`
- `results\final\sla_compliance\sla_compliance_heatmap.png`
- `results\final\sla_compliance\sla_compliance_summary.csv`
- `run_all_final_experiments.sh`
- `scripts\build-consolidated-results.js`
- `scripts\export-results.js`
- `scripts\export-results.sh`
- `scripts\failure-injection.js`
- `scripts\results_validator.py`
- `scripts\run-experiments.ps1`
- `scripts\run-final-validation-experiments.js`
- `scripts\run-ieee-experiments.js`
- `scripts\run-smoke-test.js`
- `scripts\run-smoke-test.ps1`
- `scripts\run-smoke-test.sh`
- `scripts\seed-data.js`
- `scripts\seed-data.ps1`
- `scripts\seed-data.sh`
- `SECURITY.md`
- `services\batch-sync-worker\.dockerignore`
- `services\batch-sync-worker\Dockerfile`
- `services\batch-sync-worker\package.json`
- `services\batch-sync-worker\package-lock.json`
- `services\batch-sync-worker\src\db.js`
- `services\batch-sync-worker\src\index.js`
- `services\batch-sync-worker\src\logger.js`
- `services\batch-sync-worker\src\metrics.js`
- `services\client-service\.dockerignore`
- `services\client-service\Dockerfile`
- `services\client-service\package.json`
- `services\client-service\package-lock.json`
- `services\client-service\src\db.js`
- `services\client-service\src\index.js`
- `services\client-service\src\kafka.js`
- `services\client-service\src\logger.js`
- `services\client-service\src\metrics.js`
- `services\orders-projection-consumer\.dockerignore`
- `services\orders-projection-consumer\Dockerfile`
- `services\orders-projection-consumer\package.json`
- `services\orders-projection-consumer\package-lock.json`
- `services\orders-projection-consumer\src\db.js`
- `services\orders-projection-consumer\src\index.js`
- `services\orders-projection-consumer\src\kafka.js`
- `services\orders-projection-consumer\src\logger.js`
- `services\orders-projection-consumer\src\metrics.js`
- `services\orders-service\.dockerignore`
- `services\orders-service\Dockerfile`
- `services\orders-service\package.json`
- `services\orders-service\package-lock.json`
- `services\orders-service\src\db.js`
- `services\orders-service\src\index.js`
- `services\orders-service\src\logger.js`
- `services\orders-service\src\metrics.js`
- `VERSION`

## Requires Edits Or Follow-Up

- CITATION.cff: replace author, ORCID, DOI, and repository placeholders when final proceedings metadata is available.
- Legacy docs contain historical experiment-plan text and some encoding artifacts; release notes were added at the top to point readers to authoritative evidence classification.
- Full expensive experiment suite was not rerun during this audit.

## Excluded Files And Reasons

- .env - local credentials/config; excluded, use .env.example
- node_modules/ and **/node_modules/ - generated dependencies
- scripts/__pycache__/ - Python bytecode
- results1.zip, results2.zip, results3.zip - local/archive packages
- paper/ - generated manuscript tables, figures, and draft material
- docs/ieee-paper-draft.md - unpublished manuscript draft; not staged
- release-staging/ - generated release package output
- .github/prompts/ - local workflow prompt, not part of reproducibility artifact

## Missing Or Unavailable Reproducibility Inputs

- Git history is unavailable because this directory has no .git/ repository metadata.
- Final DOI/proceedings metadata is not available and was not invented.
- Full Docker image build and runtime smoke test were not run end-to-end in this audit; Docker Compose syntax and result validator were run.

## Secret And Privacy Scan

- Staged release scan found no hard-coded private credentials, private keys, cloud credentials, bearer tokens, webhook URLs, or local absolute paths requiring removal.
- Expected hits: .env.example placeholder password names, Compose environment-variable references, synthetic example.com seed records, fictional 555 phone numbers, and documentation text about secrets.
- Local .env contains weak local sample passwords and is excluded. Rotate/change any local values before use if they were ever reused outside this test stack.
- Gitleaks/trufflehog were not installed or run.

## Validation Command Log

- npm install --package-lock-only --ignore-scripts: passed after escalation; updated lockfile metadata.
- docker compose config --quiet: passed after escalation.
- python scripts/results_validator.py: passed after escalation.
- node --check scripts/run-smoke-test.js; node --check scripts/run-final-validation-experiments.js; node --check scripts/seed-data.js: passed after escalation.
- npm audit --omit=dev: rejected by approval reviewer because it would disclose dependency metadata to npm.
- npm ci --ignore-scripts --offline: passed using local npm cache; npm reported 0 vulnerabilities.
- npm ls --omit=dev --all --depth=0: passed after offline install.
- rg staged secret/privacy scan: completed with only expected placeholders and synthetic data hits.

## Build And Smoke-Test Status

- Docker Compose configuration validation: PASS.
- Result artifact validator: PASS.
- JavaScript syntax checks: PASS.
- Offline dependency install: PASS.
- Full Docker build/start and runtime smoke test: not executed end-to-end during this pass.

## Release Package

- Staging folder: release-staging/experiment-data-mesh-study-v1.0.0/ outside the repository.
- ZIP: release-staging/experiment-data-mesh-study-v1.0.0.zip.
- ZIP SHA-256: see release-staging/experiment-data-mesh-study-v1.0.0.sha256.
- Files larger than 10 MB in staged release: none.
- Binary files in staged release: reviewed PNG result figures only.
- Archives inside staged release: none.

## Git Readiness

- Exact Git file inclusion should match the staged release list above.
- git status --short --ignored and git ls-files cannot run until a Git repository is initialized.
- Recommended initial commit message: Prepare v1.0.0 reproducibility artifact for ICITCE 2026.

Suggested commands after initializing or entering the intended Git repository:

```bash
git add .
git status --short --ignored
git commit -m "Prepare v1.0.0 reproducibility artifact for ICITCE 2026"
```

## Suggested GitHub Release

- Title: v1.0.0 Reproducibility Artifact for ICITCE 2026
- Notes: use RELEASE_NOTES.md; attach experiment-data-mesh-study-v1.0.0.zip and experiment-data-mesh-study-v1.0.0.sha256.

## Confirmation

No push, publication, GitHub repository creation, or automatic commit was performed.
