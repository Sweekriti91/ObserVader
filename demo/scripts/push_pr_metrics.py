#!/usr/bin/env python3
"""Read PR metrics from NDJSON and push to Prometheus Pushgateway + OTLP.

Sends OTLP gauge data points for ALL 28 days (so timeseries panels render)
and also pushes the latest day to Prometheus Pushgateway (for backward compat).

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
from datetime import datetime, timezone
from pathlib import Path

import requests
from prometheus_client import CollectorRegistry, Gauge, push_to_gateway

from prom_remote_write import remote_write

NDJSON_PATH = Path(__file__).resolve().parent.parent / "sample-data" / "enterprise-28d.ndjson"


def parse_args():
    parser = argparse.ArgumentParser(description="Push PR metrics to Pushgateway")
    parser.add_argument("--gateway", default="localhost:9091", help="Pushgateway host:port")
    parser.add_argument("--ndjson", default=str(NDJSON_PATH), help="Path to NDJSON file")
    parser.add_argument("--prometheus-url", default="http://localhost:9090", help="Prometheus URL for remote write")
    return parser.parse_args()


# ── Per-day metric extraction ─────────────────────────────────────

def compute_pr_metrics(record):
    """Extract PR metric values from a single day's NDJSON record."""
    pr_section = record.get("copilot_pull_requests", {})
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

    all_merge_minutes.sort()
    copilot_merge_minutes.sort()
    copilot_reviewed_merge_minutes.sort()
    median_all = all_merge_minutes[len(all_merge_minutes) // 2] if all_merge_minutes else 0
    median_copilot = copilot_merge_minutes[len(copilot_merge_minutes) // 2] if copilot_merge_minutes else 0
    median_copilot_reviewed = copilot_reviewed_merge_minutes[len(copilot_reviewed_merge_minutes) // 2] if copilot_reviewed_merge_minutes else 0

    return [
        ("copilot_pr_merged_total", total_merged, {}),
        ("copilot_pr_merged_copilot", copilot_merged, {}),
        ("copilot_pr_merged_copilot_reviewed", copilot_reviewed_merged, {}),
        ("copilot_pr_median_merge_minutes", median_all, {"type": "all"}),
        ("copilot_pr_median_merge_minutes", median_copilot, {"type": "copilot"}),
        ("copilot_pr_median_merge_minutes", median_copilot_reviewed, {"type": "copilot_reviewed"}),
    ]


# ── Prometheus Remote Write transport ─────────────────────────────

def send_remote_write(day_metrics_list, prometheus_url):
    """Send all days' gauge data directly to Prometheus via remote write."""
    series_map = {}

    for date_str, metrics in day_metrics_list:
        dt = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)
        ts_ms = int(dt.timestamp() * 1000)

        for name, value, labels in metrics:
            label_tuples = [("__name__", name)] + sorted(labels.items())
            key = tuple(label_tuples)
            if key not in series_map:
                series_map[key] = {"labels": label_tuples, "samples": []}
            series_map[key]["samples"].append((float(value), ts_ms))

    timeseries = []
    for data in series_map.values():
        data["samples"].sort(key=lambda s: s[1])
        timeseries.append(data)

    total = 0
    BATCH = 100
    for i in range(0, len(timeseries), BATCH):
        batch = timeseries[i:i + BATCH]
        total += remote_write(prometheus_url, batch)

    return total


# ── Pushgateway push (latest day, backward compat) ───────────────

def push_latest_to_gateway(metrics, gateway):
    """Push latest day's PR metrics to Pushgateway."""
    registry = CollectorRegistry()

    # Group metrics by name to avoid duplicate Gauge registrations
    gauges = {}
    for name, value, labels in metrics:
        label_names = list(labels.keys())
        key = name
        if key not in gauges:
            gauges[key] = Gauge(name, name, label_names, registry=registry)
        if label_names:
            gauges[key].labels(**labels).set(value)
        else:
            gauges[key].set(value)

    push_to_gateway(gateway, job="copilot_pr_metrics", registry=registry)


def main():
    args = parse_args()
    ndjson_path = Path(args.ndjson)

    if not ndjson_path.exists():
        raise SystemExit(f"NDJSON file not found: {ndjson_path}\nRun generate_sample_data.py first.")

    days = []
    with open(ndjson_path) as f:
        for line in f:
            line = line.strip()
            if line:
                days.append(json.loads(line))

    if not days:
        raise SystemExit("NDJSON file is empty.")

    # ── Compute metrics for all 28 days ──
    day_metrics_list = []
    for record in days:
        metrics = compute_pr_metrics(record)
        day_metrics_list.append((record["date"], metrics))

    # ── Send gauge data for all days via Prometheus remote write ──
    try:
        count = send_remote_write(day_metrics_list, args.prometheus_url)
        print(f"Remote-wrote {count} time series ({len(day_metrics_list)} days) to {args.prometheus_url}")
    except Exception as e:
        print(f"Warning: Remote write failed ({e}), falling back to Pushgateway only")

    # ── Push latest day to Pushgateway ──
    latest_metrics = compute_pr_metrics(days[-1])
    push_latest_to_gateway(latest_metrics, args.gateway)

    print(f"Pushed PR metrics to {args.gateway}:")
    for name, value, labels in latest_metrics:
        label_str = "{" + ",".join(f'{k}="{v}"' for k, v in labels.items()) + "}" if labels else ""
        print(f"  {name}{label_str} = {value}")


if __name__ == "__main__":
    main()
