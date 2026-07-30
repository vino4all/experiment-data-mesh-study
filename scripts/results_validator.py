#!/usr/bin/env python3
import csv
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS_FINAL = ROOT / "results" / "final"
REQUIRED_FILES = [
    RESULTS_FINAL / "batch_validation" / "batch_validation_raw.csv",
    RESULTS_FINAL / "batch_validation" / "batch_validation_summary.csv",
    RESULTS_FINAL / "batch_validation" / "batch_validation_stats.json",
    RESULTS_FINAL / "batch_validation" / "batch_interval_vs_freshness.png",
    RESULTS_FINAL / "sla_compliance" / "sla_compliance.csv",
    RESULTS_FINAL / "sla_compliance" / "sla_compliance_by_sla_summary.csv",
    RESULTS_FINAL / "sla_compliance" / "sla_compliance_summary.csv",
    RESULTS_FINAL / "sla_compliance" / "sla_compliance_heatmap.png",
    RESULTS_FINAL / "recovery_validation" / "recovery_trials.csv",
    RESULTS_FINAL / "recovery_validation" / "recovery_summary.csv",
    RESULTS_FINAL / "recovery_validation" / "recovery_duration_distribution.png",
    RESULTS_FINAL / "api_dependency" / "api_dependency_matrix.csv",
    RESULTS_FINAL / "api_dependency" / "api_dependency_summary.csv",
    RESULTS_FINAL / "api_dependency" / "api_delay_vs_orders_latency.png",
    RESULTS_FINAL / "api_dependency" / "api_delay_vs_throughput.png",
    RESULTS_FINAL / "hybrid" / "hybrid_comparison.csv",
    RESULTS_FINAL / "hybrid" / "hybrid_scores.csv",
    RESULTS_FINAL / "hybrid" / "pattern_comparison_radar.png",
    RESULTS_FINAL / "hybrid" / "pattern_comparison_bar.png",
    RESULTS_FINAL / "api_dependency" / "README.md",
    RESULTS_FINAL / "batch_validation" / "README.md",
    RESULTS_FINAL / "recovery_validation" / "README.md",
    RESULTS_FINAL / "hybrid" / "README.md",
    RESULTS_FINAL / "sla_compliance" / "README.md",
]

REQUIRED_SUMMARY_COLUMNS = {
    "results/final/batch_validation/batch_validation_summary.csv": {
        "interval_minutes",
        "sample_count",
        "mean_freshness_lag_ms",
        "median_freshness_lag_ms",
        "p50_freshness_lag_ms",
        "p95_freshness_lag_ms",
        "p99_freshness_lag_ms",
        "stale_read_rate",
    },
    "results/final/sla_compliance/sla_compliance_summary.csv": {
        "pattern",
        "sample_count",
        "mean_compliance_percent",
        "ci95_lower",
        "ci95_upper",
    },
    "results/final/sla_compliance/sla_compliance_by_sla_summary.csv": {
        "pattern",
        "sla_target_ms",
        "trials",
        "sample_count",
        "mean_compliance_percent",
        "ci95_lower",
        "ci95_upper",
    },
    "results/final/recovery_validation/recovery_summary.csv": {
        "sample_count",
        "recovery_duration_ms_mean",
        "catchup_rate_events_per_second_mean",
    },
    "results/final/api_dependency/api_dependency_summary.csv": {
        "delay_ms",
        "sample_count",
        "orders_p95_latency_mean",
        "throughput_mean",
    },
    "results/final/hybrid/hybrid_scores.csv": {
        "pattern",
        "architecture_effectiveness_score",
    },
}


def fail(message: str) -> None:
    print(f"[validator] FAIL: {message}")
    sys.exit(1)


def check_required_files() -> None:
    missing = [str(path.relative_to(ROOT)) for path in REQUIRED_FILES if not path.exists()]
    if missing:
        fail("Missing required files:\n  - " + "\n  - ".join(missing))


def check_csv_columns() -> None:
    for rel_path, expected_columns in REQUIRED_SUMMARY_COLUMNS.items():
        file_path = ROOT / rel_path
        if not file_path.exists():
            fail(f"Missing CSV for schema validation: {rel_path}")

        with file_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            columns = set(reader.fieldnames or [])
            missing = expected_columns - columns
            if missing:
                fail(f"CSV {rel_path} missing columns: {sorted(missing)}")


def check_json() -> None:
    stats_file = RESULTS_FINAL / "batch_validation" / "batch_validation_stats.json"
    with stats_file.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list) or len(data) == 0:
        fail("batch_validation_stats.json must contain a non-empty list")


def check_pngs() -> None:
    pngs = list(RESULTS_FINAL.glob("*/*.png"))
    if len(pngs) < 6:
        fail("Expected at least 6 figure PNG files in results/final")


def main() -> None:
    check_required_files()
    check_csv_columns()
    check_json()
    check_pngs()
    print("[validator] PASS: final experiment artifacts validated")


if __name__ == "__main__":
    main()
