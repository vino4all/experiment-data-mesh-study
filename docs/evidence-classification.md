# Evidence Classification

This repository separates supported reproducibility artifacts from exploratory
or invalidated runs.

| Artifact folder | Include in Git | Classification | Public-use rule |
| --- | --- | --- | --- |
| `results/final/api_dependency` | Yes | SUPPORTED descriptive evidence | Use for observed direct-API latency and throughput under injected delay. |
| `results/final/recovery_validation` | Yes | SUPPORTED replicated evidence | Use for ten-trial projection recovery and catch-up claims. |
| `results/final/batch_validation` | Yes | DESCRIPTIVE pre-convergence evidence; interval comparison invalidated | Do not use as interval-comparison evidence. |
| `results/final/hybrid` | Yes | EXPLORATORY | Do not claim hybrid superiority from these files. |
| `results/final/sla_compliance` | Yes | INVALIDATED FOR COMPARATIVE CLAIMS | Do not compare SLA compliance across architectures from these files. |

## Valid Claim Boundary

The API dependency experiment is a supported descriptive observation. The
recovery validation experiment is supported replicated evidence because it uses
ten reset-and-reseed trials.

Batch validation, SLA compliance, and hybrid results are retained so reviewers
can inspect what was run and why the protocol changed. They must be described as
transparent archived evidence, not as primary reproducible findings.
