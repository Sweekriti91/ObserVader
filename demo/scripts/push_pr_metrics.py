#!/usr/bin/env python3
"""Read PR metrics from NDJSON and push to Prometheus Pushgateway.

The Grafana dashboard expects these metrics:
  - copilot_pr_merged_total
  - copilot_pr_merged_copilot
  - copilot_pr_merged_copilot_reviewed
  - copilot_pr_median_merge_minutes{type="all"}
  - copilot_pr_median_merge_minutes{type="copilot"}
  - copilot_pr_median_merge_minutes{type="copilot_reviewed"}

Usage:
  python3 scripts/push_pr_metrics.py                          # defaults
  python3 scripts/push_pr_metrics.py --gateway http://host:9091
"""

import argparse
import json
from pathlib import Path

from prometheus_client import CollectorRegistry, Gauge, push_to_gateway

NDJSON_PATH = Path(__file__).resolve().parent.parent / "sample-data" / "enterprise-28d.ndjson"


def parse_args():
    parser = argparse.ArgumentParser(description="Push PR metrics to Pushgateway")
    parser.add_argument("--gateway", default="localhost:9091", help="Pushgateway host:port")
    parser.add_argument("--ndjson", default=str(NDJSON_PATH), help="Path to NDJSON file")
    return parser.parse_args()


def main():
    args = parse_args()
    ndjson_path = Path(args.ndjson)

    if not ndjson_path.exists():
        raise SystemExit(f"NDJSON file not found: {ndjson_path}\nRun generate_sample_data.py first.")

    # Read all days and use the latest day's aggregated values
    days = []
    with open(ndjson_path) as f:
        for line in f:
            line = line.strip()
            if line:
                days.append(json.loads(line))

    if not days:
        raise SystemExit("NDJSON file is empty.")

    # Use the last (most recent) day for current gauge values
    latest = days[-1]
    pr_section = latest.get("copilot_pull_requests", {})
    repos = pr_section.get("repositories", [])

    total_merged = 0
    copilot_merged = 0
    copilot_reviewed_merged = 0
    all_merge_minutes = []
    copilot_merge_minutes = []
    copilot_reviewed_merge_minutes = []

    for repo in repos:
        for model in repo.get("models", []):
            total_merged += model.get("total_pr_merged_count", 0)
            copilot_merged += model.get("total_copilot_pr_merged_count", 0)
            copilot_reviewed_merged += model.get("total_merged_reviewed_by_copilot", 0)
            ttm = model.get("median_minutes_to_merge", 0)
            cop_ttm = model.get("median_minutes_to_merge_for_copilot_prs", 0)
            cop_rev_ttm = model.get("median_minutes_to_merge_copilot_reviewed", 0)
            if ttm > 0:
                all_merge_minutes.append(ttm)
            if cop_ttm > 0:
                copilot_merge_minutes.append(cop_ttm)
            if cop_rev_ttm > 0:
                copilot_reviewed_merge_minutes.append(cop_rev_ttm)

    # Compute overall medians (median of repo medians as approximation)
    all_merge_minutes.sort()
    copilot_merge_minutes.sort()
    copilot_reviewed_merge_minutes.sort()
    median_all = all_merge_minutes[len(all_merge_minutes) // 2] if all_merge_minutes else 0
    median_copilot = copilot_merge_minutes[len(copilot_merge_minutes) // 2] if copilot_merge_minutes else 0
    median_copilot_reviewed = copilot_reviewed_merge_minutes[len(copilot_reviewed_merge_minutes) // 2] if copilot_reviewed_merge_minutes else 0

    # Build registry and push
    registry = CollectorRegistry()

    g_merged_total = Gauge(
        "copilot_pr_merged_total",
        "Total PRs merged (latest day)",
        registry=registry,
    )
    g_merged_total.set(total_merged)

    g_merged_copilot = Gauge(
        "copilot_pr_merged_copilot",
        "Copilot-authored PRs merged (latest day)",
        registry=registry,
    )
    g_merged_copilot.set(copilot_merged)

    g_merged_copilot_reviewed = Gauge(
        "copilot_pr_merged_copilot_reviewed",
        "PRs merged that were reviewed by Copilot (latest day)",
        registry=registry,
    )
    g_merged_copilot_reviewed.set(copilot_reviewed_merged)

    g_merge_time = Gauge(
        "copilot_pr_median_merge_minutes",
        "Median minutes to merge",
        ["type"],
        registry=registry,
    )
    g_merge_time.labels(type="all").set(median_all)
    g_merge_time.labels(type="copilot").set(median_copilot)
    g_merge_time.labels(type="copilot_reviewed").set(median_copilot_reviewed)

    push_to_gateway(args.gateway, job="copilot_pr_metrics", registry=registry)
    print(f"Pushed PR metrics to {args.gateway}:")
    print(f"  copilot_pr_merged_total       = {total_merged}")
    print(f"  copilot_pr_merged_copilot     = {copilot_merged}")
    print(f"  copilot_pr_merged_copilot_reviewed = {copilot_reviewed_merged}")
    print(f"  copilot_pr_median_merge_minutes{{type=\"all\"}}     = {median_all}")
    print(f"  copilot_pr_median_merge_minutes{{type=\"copilot\"}} = {median_copilot}")
    print(f"  copilot_pr_median_merge_minutes{{type=\"copilot_reviewed\"}} = {median_copilot_reviewed}")


if __name__ == "__main__":
    main()
