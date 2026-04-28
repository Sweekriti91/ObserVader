#!/usr/bin/env python3
"""Read usage metrics from NDJSON and push adoption/feature/LoC/CCR metrics.

Sends OTLP gauge data points for ALL 28 days (so timeseries panels render)
and also pushes the latest day to Prometheus Pushgateway (for backward compat).

The Grafana dashboard expects these metrics:
  - copilot_daily_active_users{surface="ide|cli"}
  - copilot_monthly_active_users
  - copilot_monthly_active_agent_users
  - copilot_monthly_active_cloud_agent_users
  - copilot_feature_usage{feature="completions|chat_ask|chat_edit|chat_agent|cli"}
  - copilot_loc_suggested
  - copilot_loc_added
  - copilot_survival_rate
  - copilot_ccr_suggestions_generated
  - copilot_ccr_suggestions_applied
  - copilot_ccr_trigger_rate

Usage:
  python3 scripts/push_usage_metrics.py                          # defaults
  python3 scripts/push_usage_metrics.py --gateway http://host:9091
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
    parser = argparse.ArgumentParser(description="Push usage metrics to Pushgateway")
    parser.add_argument("--gateway", default="localhost:9091", help="Pushgateway host:port")
    parser.add_argument("--ndjson", default=str(NDJSON_PATH), help="Path to NDJSON file")
    parser.add_argument("--prometheus-url", default="http://localhost:9090", help="Prometheus URL for remote write")
    return parser.parse_args()


# ── Per-day metric extraction ─────────────────────────────────────

def compute_day_metrics(record, max_engaged_so_far):
    """Extract metric values from a single day's NDJSON record."""
    metrics = []

    # DAU by surface
    ide_dau = record.get("total_active_users", 0)
    cli_section = record.get("copilot_cli", {})
    cli_dau = cli_section.get("total_engaged_users", 0)
    metrics.append(("copilot_daily_active_users", ide_dau, {"surface": "ide"}))
    metrics.append(("copilot_daily_active_users", cli_dau, {"surface": "cli"}))

    # MAU (rolling max of engaged users seen so far)
    engaged = record.get("total_engaged_users", 0)
    mau = max(max_engaged_so_far, engaged)
    metrics.append(("copilot_monthly_active_users", mau, {}))

    # Agent MAU (~40% of chat users)
    chat_section = record.get("copilot_ide_chat", {})
    chat_users = chat_section.get("total_engaged_users", 0)
    agent_users = int(chat_users * 0.40)
    metrics.append(("copilot_monthly_active_agent_users", agent_users, {}))

    # Cloud Agent MAU
    cloud_agent_mau = record.get("monthly_active_copilot_cloud_agent_users", 0) or 0
    metrics.append(("copilot_monthly_active_cloud_agent_users", cloud_agent_mau, {}))

    # Feature usage
    completions_section = record.get("copilot_ide_code_completions", {})
    metrics.append(("copilot_feature_usage", completions_section.get("total_engaged_users", 0), {"feature": "completions"}))
    metrics.append(("copilot_feature_usage", int(chat_users * 0.30), {"feature": "chat_ask"}))
    metrics.append(("copilot_feature_usage", int(chat_users * 0.25), {"feature": "chat_edit"}))
    metrics.append(("copilot_feature_usage", agent_users, {"feature": "chat_agent"}))
    metrics.append(("copilot_feature_usage", cli_dau, {"feature": "cli"}))

    # Lines of Code
    total_suggested = 0
    total_added = 0
    for editor in completions_section.get("editors", []):
        for model in editor.get("models", []):
            total_suggested += model.get("loc_suggested_to_add_sum", model.get("total_code_lines_suggested", 0))
            total_added += model.get("loc_added_sum", 0)
    metrics.append(("copilot_loc_suggested", total_suggested, {}))
    metrics.append(("copilot_loc_added", total_added, {}))

    # Survival Rate
    total_suggestions = 0
    total_acceptances = 0
    for editor in completions_section.get("editors", []):
        for model in editor.get("models", []):
            total_suggestions += model.get("total_code_suggestions", 0)
            total_acceptances += model.get("total_code_acceptances", 0)
    survival = total_acceptances / max(total_suggestions, 1)
    metrics.append(("copilot_survival_rate", round(survival, 4), {}))

    # CCR Metrics
    pr_section = record.get("copilot_pull_requests", {})
    ccr_generated = 0
    ccr_applied = 0
    ccr_reviews_with = 0
    for repo in pr_section.get("repositories", []):
        for model in repo.get("models", []):
            ccr_generated += model.get("total_code_review_copilot_suggestions_count", 0)
            ccr_applied += model.get("total_code_review_copilot_suggestions_applied_count", 0)
            ccr_reviews_with += model.get("total_code_reviews_with_copilot_suggestions_count", 0)
    metrics.append(("copilot_ccr_suggestions_generated", ccr_generated, {}))
    metrics.append(("copilot_ccr_suggestions_applied", ccr_applied, {}))
    total_prs = sum(
        model.get("total_pr_created_count", 0)
        for repo in pr_section.get("repositories", [])
        for model in repo.get("models", [])
    )
    trigger_rate = ccr_reviews_with / max(total_prs, 1)
    metrics.append(("copilot_ccr_trigger_rate", round(trigger_rate, 4), {}))

    return metrics, mau


# ── Prometheus Remote Write transport ─────────────────────────────

def send_remote_write(day_metrics_list, prometheus_url):
    """Send all days' gauge data directly to Prometheus via remote write."""
    # Build one time series per unique (metric_name, labels) combination,
    # with one sample per day
    series_map = {}  # key -> {"labels": [...], "samples": [...]}

    for date_str, metrics in day_metrics_list:
        dt = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)
        ts_ms = int(dt.timestamp() * 1000)

        for name, value, labels in metrics:
            label_tuples = [("__name__", name)] + sorted(labels.items())
            key = tuple(label_tuples)
            if key not in series_map:
                series_map[key] = {"labels": label_tuples, "samples": []}
            series_map[key]["samples"].append((float(value), ts_ms))

    # Sort samples by timestamp (Prometheus requires monotonic order)
    timeseries = []
    for data in series_map.values():
        data["samples"].sort(key=lambda s: s[1])
        timeseries.append(data)

    # Send in batches of 100 time series
    BATCH = 100
    total = 0
    for i in range(0, len(timeseries), BATCH):
        batch = timeseries[i:i + BATCH]
        total += remote_write(prometheus_url, batch)

    return total


# ── Pushgateway push (latest day, backward compat) ───────────────

def push_latest_to_gateway(latest, max_engaged, gateway):
    """Push latest day's data to Pushgateway for stat/KPI panels."""
    registry = CollectorRegistry()

    ide_dau = latest.get("total_active_users", 0)
    cli_section = latest.get("copilot_cli", {})
    cli_dau = cli_section.get("total_engaged_users", 0)

    g_dau = Gauge("copilot_daily_active_users", "Daily active users", ["surface"], registry=registry)
    g_dau.labels(surface="ide").set(ide_dau)
    g_dau.labels(surface="cli").set(cli_dau)

    g_mau = Gauge("copilot_monthly_active_users", "Monthly active users", registry=registry)
    g_mau.set(max_engaged)

    chat_section = latest.get("copilot_ide_chat", {})
    chat_users = chat_section.get("total_engaged_users", 0)
    agent_users = int(chat_users * 0.40)

    g_agent_mau = Gauge("copilot_monthly_active_agent_users", "Monthly active agent users", registry=registry)
    g_agent_mau.set(agent_users)

    g_cloud_agent_mau = Gauge("copilot_monthly_active_cloud_agent_users", "Monthly active cloud agent users", registry=registry)
    cloud_agent_mau = latest.get("monthly_active_copilot_cloud_agent_users", 0) or 0
    g_cloud_agent_mau.set(cloud_agent_mau)

    completions_section = latest.get("copilot_ide_code_completions", {})
    g_feature = Gauge("copilot_feature_usage", "Feature adoption", ["feature"], registry=registry)
    g_feature.labels(feature="completions").set(completions_section.get("total_engaged_users", 0))
    g_feature.labels(feature="chat_ask").set(int(chat_users * 0.30))
    g_feature.labels(feature="chat_edit").set(int(chat_users * 0.25))
    g_feature.labels(feature="chat_agent").set(agent_users)
    g_feature.labels(feature="cli").set(cli_dau)

    total_suggested = 0
    total_added = 0
    for editor in completions_section.get("editors", []):
        for model in editor.get("models", []):
            total_suggested += model.get("loc_suggested_to_add_sum", model.get("total_code_lines_suggested", 0))
            total_added += model.get("loc_added_sum", 0)
    Gauge("copilot_loc_suggested", "LoC suggested", registry=registry).set(total_suggested)
    Gauge("copilot_loc_added", "LoC added", registry=registry).set(total_added)

    total_suggestions = 0
    total_acceptances = 0
    for editor in completions_section.get("editors", []):
        for model in editor.get("models", []):
            total_suggestions += model.get("total_code_suggestions", 0)
            total_acceptances += model.get("total_code_acceptances", 0)
    survival = total_acceptances / max(total_suggestions, 1)
    Gauge("copilot_survival_rate", "Survival rate", registry=registry).set(round(survival, 4))

    pr_section = latest.get("copilot_pull_requests", {})
    ccr_generated = 0
    ccr_applied = 0
    ccr_reviews_with = 0
    for repo in pr_section.get("repositories", []):
        for model in repo.get("models", []):
            ccr_generated += model.get("total_code_review_copilot_suggestions_count", 0)
            ccr_applied += model.get("total_code_review_copilot_suggestions_applied_count", 0)
            ccr_reviews_with += model.get("total_code_reviews_with_copilot_suggestions_count", 0)
    Gauge("copilot_ccr_suggestions_generated", "CCR generated", registry=registry).set(ccr_generated)
    Gauge("copilot_ccr_suggestions_applied", "CCR applied", registry=registry).set(ccr_applied)
    total_prs = sum(
        model.get("total_pr_created_count", 0)
        for repo in pr_section.get("repositories", [])
        for model in repo.get("models", [])
    )
    trigger_rate = ccr_reviews_with / max(total_prs, 1)
    Gauge("copilot_ccr_trigger_rate", "CCR trigger rate", registry=registry).set(round(trigger_rate, 4))

    push_to_gateway(gateway, job="copilot_usage_metrics", registry=registry)


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
    max_engaged = 0
    for record in days:
        metrics, max_engaged = compute_day_metrics(record, max_engaged)
        day_metrics_list.append((record["date"], metrics))

    # ── Send gauge data for all days via Prometheus remote write ──
    try:
        count = send_remote_write(day_metrics_list, args.prometheus_url)
        print(f"Remote-wrote {count} time series ({len(day_metrics_list)} days) to {args.prometheus_url}")
    except Exception as e:
        print(f"Warning: Remote write failed ({e}), falling back to Pushgateway only")

    # ── Push latest day to Pushgateway (fills stat/KPI panels) ──
    push_latest_to_gateway(days[-1], max_engaged, args.gateway)

    latest = days[-1]
    ide_dau = latest.get("total_active_users", 0)
    cli_dau = latest.get("copilot_cli", {}).get("total_engaged_users", 0)
    print(f"Pushed usage metrics to {args.gateway}:")
    print(f"  copilot_daily_active_users{{surface=\"ide\"}}  = {ide_dau}")
    print(f"  copilot_daily_active_users{{surface=\"cli\"}}  = {cli_dau}")
    print(f"  copilot_monthly_active_users               = {max_engaged}")
    print(f"  + all other usage metrics for {len(days)} days")


if __name__ == "__main__":
    main()
