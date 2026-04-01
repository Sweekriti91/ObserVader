#!/usr/bin/env python3
"""Read usage metrics from NDJSON and push adoption/feature/LoC/CCR metrics to Prometheus Pushgateway.

Complements push_pr_metrics.py which handles PR-specific metrics.

The Grafana dashboard expects these metrics:
  - copilot_daily_active_users{surface="ide|cli"}
  - copilot_monthly_active_users
  - copilot_monthly_active_agent_users
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
from pathlib import Path

from prometheus_client import CollectorRegistry, Gauge, push_to_gateway

NDJSON_PATH = Path(__file__).resolve().parent.parent / "sample-data" / "enterprise-28d.ndjson"


def parse_args():
    parser = argparse.ArgumentParser(description="Push usage metrics to Pushgateway")
    parser.add_argument("--gateway", default="localhost:9091", help="Pushgateway host:port")
    parser.add_argument("--ndjson", default=str(NDJSON_PATH), help="Path to NDJSON file")
    return parser.parse_args()


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

    registry = CollectorRegistry()

    # ── Daily Active Users (latest day, by surface) ──
    latest = days[-1]

    g_dau = Gauge(
        "copilot_daily_active_users",
        "Daily active users",
        ["surface"],
        registry=registry,
    )
    ide_dau = latest.get("total_active_users", 0)
    cli_section = latest.get("copilot_cli", {})
    cli_dau = cli_section.get("total_engaged_users", 0)
    g_dau.labels(surface="ide").set(ide_dau)
    g_dau.labels(surface="cli").set(cli_dau)

    # ── Monthly Active Users (rolling 28-day unique engaged) ──
    # Approximate: use max engaged across all days as proxy for 28d unique
    g_mau = Gauge(
        "copilot_monthly_active_users",
        "Monthly active users (28-day rolling engaged)",
        registry=registry,
    )
    max_engaged = max(d.get("total_engaged_users", 0) for d in days)
    g_mau.set(max_engaged)

    # ── Monthly Active Agent Users ──
    # Approximate: use chat_agent engaged users as proxy
    g_agent_mau = Gauge(
        "copilot_monthly_active_agent_users",
        "Monthly active agent mode users",
        registry=registry,
    )
    # Estimate agent users as ~40% of chat users from latest day
    chat_section = latest.get("copilot_ide_chat", {})
    chat_users = chat_section.get("total_engaged_users", 0)
    agent_users = int(chat_users * 0.40)
    g_agent_mau.set(agent_users)

    # ── Feature Usage ──
    g_feature = Gauge(
        "copilot_feature_usage",
        "Feature adoption (engaged users)",
        ["feature"],
        registry=registry,
    )
    completions_section = latest.get("copilot_ide_code_completions", {})
    g_feature.labels(feature="completions").set(completions_section.get("total_engaged_users", 0))

    # Chat modes — approximate split from total chat users
    g_feature.labels(feature="chat_ask").set(int(chat_users * 0.30))
    g_feature.labels(feature="chat_edit").set(int(chat_users * 0.25))
    g_feature.labels(feature="chat_agent").set(agent_users)

    g_feature.labels(feature="cli").set(cli_dau)

    # ── Lines of Code ──
    g_loc_suggested = Gauge(
        "copilot_loc_suggested",
        "Lines of code suggested",
        registry=registry,
    )
    g_loc_added = Gauge(
        "copilot_loc_added",
        "Lines of code added",
        registry=registry,
    )
    total_suggested = 0
    total_added = 0
    for editor in completions_section.get("editors", []):
        for model in editor.get("models", []):
            total_suggested += model.get("loc_suggested_to_add_sum", model.get("total_code_lines_suggested", 0))
            total_added += model.get("loc_added_sum", 0)
    g_loc_suggested.set(total_suggested)
    g_loc_added.set(total_added)

    # ── Suggestion Survival Rate ──
    g_survival = Gauge(
        "copilot_survival_rate",
        "Suggestion survival rate (acceptances / suggestions)",
        registry=registry,
    )
    total_suggestions = 0
    total_acceptances = 0
    for editor in completions_section.get("editors", []):
        for model in editor.get("models", []):
            total_suggestions += model.get("total_code_suggestions", 0)
            total_acceptances += model.get("total_code_acceptances", 0)
    survival = total_acceptances / max(total_suggestions, 1)
    g_survival.set(round(survival, 4))

    # ── Code Review (CCR) Metrics ──
    g_ccr_generated = Gauge(
        "copilot_ccr_suggestions_generated",
        "Copilot code review suggestions generated",
        registry=registry,
    )
    g_ccr_applied = Gauge(
        "copilot_ccr_suggestions_applied",
        "Copilot code review suggestions applied",
        registry=registry,
    )
    g_ccr_trigger = Gauge(
        "copilot_ccr_trigger_rate",
        "Copilot code review trigger rate (reviews with suggestions / total reviews)",
        registry=registry,
    )
    pr_section = latest.get("copilot_pull_requests", {})
    ccr_generated = 0
    ccr_applied = 0
    ccr_reviews_with = 0
    for repo in pr_section.get("repositories", []):
        for model in repo.get("models", []):
            ccr_generated += model.get("total_code_review_copilot_suggestions_count", 0)
            ccr_applied += model.get("total_code_review_copilot_suggestions_applied_count", 0)
            ccr_reviews_with += model.get("total_code_reviews_with_copilot_suggestions_count", 0)
    g_ccr_generated.set(ccr_generated)
    g_ccr_applied.set(ccr_applied)
    # Approximate trigger rate
    total_prs = sum(
        model.get("total_pr_created_count", 0)
        for repo in pr_section.get("repositories", [])
        for model in repo.get("models", [])
    )
    trigger_rate = ccr_reviews_with / max(total_prs, 1)
    g_ccr_trigger.set(round(trigger_rate, 4))

    push_to_gateway(args.gateway, job="copilot_usage_metrics", registry=registry)

    print(f"Pushed usage metrics to {args.gateway}:")
    print(f"  copilot_daily_active_users{{surface=\"ide\"}}  = {ide_dau}")
    print(f"  copilot_daily_active_users{{surface=\"cli\"}}  = {cli_dau}")
    print(f"  copilot_monthly_active_users               = {max_engaged}")
    print(f"  copilot_monthly_active_agent_users          = {agent_users}")
    print(f"  copilot_feature_usage (5 features)          = pushed")
    print(f"  copilot_loc_suggested                       = {total_suggested}")
    print(f"  copilot_loc_added                           = {total_added}")
    print(f"  copilot_survival_rate                       = {survival:.4f}")
    print(f"  copilot_ccr_suggestions_generated           = {ccr_generated}")
    print(f"  copilot_ccr_suggestions_applied             = {ccr_applied}")
    print(f"  copilot_ccr_trigger_rate                    = {trigger_rate:.4f}")


if __name__ == "__main__":
    main()
