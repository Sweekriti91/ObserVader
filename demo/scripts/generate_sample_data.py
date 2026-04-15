#!/usr/bin/env python3
"""Generate 28 days of realistic GitHub Copilot Usage Metrics API (v2026-03-10) NDJSON data."""

import json
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

OUTPUT = Path(__file__).resolve().parent.parent / "sample-data" / "enterprise-28d.ndjson"
START = date(2026, 3, 3)
DAYS = 28


def noise(base: float, pct: float = 0.15) -> int:
    return max(0, round(base * random.uniform(1 - pct, 1 + pct)))


def weekend_factor(d: date) -> float:
    return 0.6 if d.weekday() >= 5 else 1.0


def lerp(start: float, end: float, t: float) -> float:
    return start + (end - start) * t


def generate_day(d: date, day_idx: int) -> dict:
    t = day_idx / (DAYS - 1)
    wf = weekend_factor(d)

    # Top-level users
    dau = noise(lerp(120, 180, t) * wf)
    engaged = min(dau, noise(dau * 0.72))

    # IDE Completions
    comp_users = min(engaged, noise(lerp(70, 100, t) * wf))
    lang_shares = {"python": 0.40, "typescript": 0.32, "java": 0.17, "go": 0.11}
    languages = [{"name": l, "total_engaged_users": noise(comp_users * s)} for l, s in lang_shares.items()]

    editors = []
    for ename, share in [("vscode", 0.71), ("jetbrains", 0.23), ("visual_studio", 0.06)]:
        eu = max(1, noise(comp_users * share))
        sug = noise(eu * 55 * wf)
        acc = noise(sug * 0.30)
        ls = noise(sug * 2.0)
        la = noise(ls * 0.30)
        loc_add = noise(ls * random.uniform(0.28, 0.35))
        editors.append({"name": ename, "total_engaged_users": eu, "models": [{
            "name": "default", "is_custom_model": False, "total_engaged_users": eu,
            "total_code_suggestions": sug, "total_code_acceptances": acc,
            "total_code_lines_suggested": ls, "total_code_lines_accepted": la,
            "loc_suggested_to_add_sum": ls, "loc_added_sum": loc_add,
        }]})

    # IDE Chat
    chat_users = min(engaged, noise(lerp(50, 80, t) * wf))
    chat_editors = []
    for ename, share in [("vscode", 0.77), ("jetbrains", 0.18), ("visual_studio", 0.05)]:
        cu = max(1, noise(chat_users * share))
        ch = noise(cu * 6.4 * wf)
        chat_editors.append({"name": ename, "total_engaged_users": cu, "models": [{
            "name": "default", "is_custom_model": False, "total_engaged_users": cu,
            "total_chats": ch, "total_chat_insertion_events": noise(ch * 0.30),
            "total_chat_copy_events": noise(ch * 0.56),
        }]})

    # CLI
    cli_users = min(engaged, noise(lerp(15, 25, t) * wf))
    cli_sess = noise(cli_users * 2.5 * wf)
    cli_req = noise(cli_sess * 2.7)
    cli_tok_s = noise(cli_req * 710)

    # Pull Requests
    pr_users = min(engaged, noise(lerp(35, 55, t) * wf))
    repos = []
    for rname, share, base_ttm, base_cop_ttm in [
        ("main-api", 0.38, 210, 140), ("web-frontend", 0.28, 195, 130),
        ("data-pipeline", 0.20, 240, 155), ("mobile-app", 0.14, 180, 120),
    ]:
        ru = max(1, noise(pr_users * share))
        prc = noise(ru * 0.9 * wf)
        prm = noise(prc * random.uniform(2.5, 3.2))
        cpc = noise(prc * random.uniform(0.35, 0.50))
        cpm = min(prm - 1 if prm > 0 else 0, noise(cpc * random.uniform(2.2, 2.8)))
        ttm = noise(base_ttm)
        cop_ttm = min(ttm - noise(30), noise(base_cop_ttm))
        rw = noise(ru * 0.7 * wf)
        rs = noise(rw * 3.0)
        # Copilot-reviewed PR merge metrics (Apr 8 2026 changelog)
        cop_reviewed_merged = noise(prm * random.uniform(0.30, 0.50))
        cop_reviewed_ttm = min(ttm - noise(20), noise(base_cop_ttm * random.uniform(0.85, 1.05)))
        repos.append({"name": rname, "total_engaged_users": ru, "models": [{
            "name": "default", "is_custom_model": False, "total_engaged_users": ru,
            "total_pr_created_count": prc, "total_pr_merged_count": prm,
            "total_copilot_pr_created_count": cpc, "total_copilot_pr_merged_count": cpm,
            "median_minutes_to_merge": ttm,
            "median_minutes_to_merge_for_copilot_prs": cop_ttm,
            "total_merged_reviewed_by_copilot": cop_reviewed_merged,
            "median_minutes_to_merge_copilot_reviewed": cop_reviewed_ttm,
            "total_code_reviews_with_copilot_suggestions_count": rw,
            "total_code_review_copilot_suggestions_count": rs,
            "total_code_review_copilot_suggestions_applied_count": noise(rs * random.uniform(0.25, 0.35)),
        }]})

    # Cloud agent active user counts (Apr 10 2026 changelog)
    cloud_agent_dau = noise(lerp(8, 20, t) * wf)
    cloud_agent_wau = noise(lerp(25, 55, t))
    cloud_agent_mau = noise(lerp(40, 80, t))

    # CLI contribution to top-level totals (Apr 10 2026 changelog)
    cli_code_gen = noise(cli_req * 0.85)
    cli_code_acc = noise(cli_code_gen * 0.40)
    cli_interactions = noise(cli_req * 0.90)
    cli_loc_add = noise(cli_req * 1.2)
    cli_loc_del = noise(cli_req * 0.3)

    # IDE-only top-level totals
    ide_code_gen = sum(
        m.get("total_code_suggestions", 0)
        for e in editors for m in e.get("models", [{}])
    )
    ide_code_acc = sum(
        m.get("total_code_acceptances", 0)
        for e in editors for m in e.get("models", [{}])
    )
    ide_interactions = noise(chat_users * 5.0 * wf)
    ide_loc_add = sum(
        m.get("loc_added_sum", 0)
        for e in editors for m in e.get("models", [{}])
    )

    return {
        "date": d.isoformat(),
        "total_active_users": dau,
        "total_engaged_users": engaged,
        # Top-level totals now include CLI (Apr 10 2026)
        "code_generation_activity_count": ide_code_gen + cli_code_gen,
        "code_acceptance_activity_count": ide_code_acc + cli_code_acc,
        "user_initiated_interaction_count": ide_interactions + cli_interactions,
        "loc_added_sum": ide_loc_add + cli_loc_add,
        "loc_deleted_sum": cli_loc_del,
        # Cloud agent active user counts (Apr 10 2026)
        "daily_active_copilot_cloud_agent_users": cloud_agent_dau,
        "weekly_active_copilot_cloud_agent_users": cloud_agent_wau,
        "monthly_active_copilot_cloud_agent_users": cloud_agent_mau,
        "copilot_ide_code_completions": {
            "total_engaged_users": comp_users, "languages": languages, "editors": editors,
        },
        "copilot_ide_chat": {"total_engaged_users": chat_users, "editors": chat_editors},
        "copilot_cli": {"total_engaged_users": cli_users, "models": [{
            "name": "default", "is_custom_model": False, "total_engaged_users": cli_users,
            "total_cli_sessions": cli_sess, "total_cli_requests": cli_req,
            "total_cli_prompts": noise(cli_req * 0.75),
            "total_cli_tokens_sent": cli_tok_s, "total_cli_tokens_received": noise(cli_tok_s * 0.50),
        }]},
        # CLI in feature breakdowns (Apr 10 2026)
        "totals_by_feature": {
            "code_completion": {"code_generation_activity_count": ide_code_gen, "code_acceptance_activity_count": ide_code_acc},
            "copilot_cli": {"code_generation_activity_count": cli_code_gen, "code_acceptance_activity_count": cli_code_acc},
        },
        "copilot_pull_requests": {"total_engaged_users": pr_users, "repositories": repos},
    }


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        for i in range(DAYS):
            f.write(json.dumps(generate_day(START + timedelta(days=i), i), separators=(",", ":")) + "\n")
    print(f"Wrote {DAYS} records to {OUTPUT}")


if __name__ == "__main__":
    main()