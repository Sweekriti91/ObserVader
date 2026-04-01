---
name: copilot-dashboards
description: >
  How to access, navigate, and interpret the Copilot usage metrics dashboard and code generation
  dashboard. Includes NDJSON export, prerequisite configuration, and actionable interpretation guidance.
tags: [copilot, dashboard, usage, adoption, code-generation, enterprise, organization]
---

# Copilot Dashboards — Complete Guide

## 1. Usage Metrics Dashboard

Visualizes 28-day Copilot usage trends. Available at **enterprise** and **organization** levels.

### Prerequisites
The **"Copilot usage metrics"** policy must be enabled:
- **Enterprise**: Settings → Policies → Copilot → "Copilot usage metrics" → Enabled everywhere
- **Organization**: Settings → Copilot → Policies → Enable "Copilot usage metrics"

### Who Can Access
- Enterprise owners
- Organization administrators
- Billing managers
- Users with enterprise custom role including "View Enterprise Copilot Metrics" permission

> **Tip**: You can grant **organization-only visibility** by creating an organization custom role
> with the "View organization Copilot metrics" permission, without providing enterprise-level access.

### Access Path
1. Navigate to your enterprise (github.com → Settings → [Enterprises](https://github.com/settings/enterprises))
2. Click the **Insights** tab
3. In the left sidebar, click **Copilot usage**

### Charts & Metrics Available

| Chart | What It Shows |
|-------|--------------|
| IDE Daily Active Users (DAU) | Unique users per day |
| IDE Weekly Active Users (WAU) | Unique users over 7-day rolling window |
| Total Active Users | Licensed users active in current calendar month |
| Code Completions (suggested/accepted) | Total inline suggestions shown and accepted |
| Code Completion Acceptance Rate | % of suggestions accepted |
| Average Chat Requests per Active User | Chat engagement depth |
| Requests per Chat Mode | Breakdown by Ask, Edit, Plan, Agent |
| Agent Adoption | % of active users who tried agent mode this month |
| Language Usage | Distribution of languages used with Copilot |
| Language Usage per Day | Daily language breakdown |
| Model Usage | Distribution of AI models used for chat |
| Model Usage per Day | Daily model breakdown |
| Model Usage per Chat Mode | Models used in Ask/Edit/Plan/Agent |
| Most Used Chat Model | Most frequent chat model in last 28 days |

### Important Notes
- Dashboard does **NOT** include Copilot CLI usage (CLI metrics are API-only)
- Data is based on IDE telemetry only
- Data may appear up to **3 full UTC days** behind the current date
- Model usage charts represent **chat activity only** (not completions)

---

## 2. Code Generation Dashboard

Shows how code is generated across user-initiated and agent-initiated activity.

### Access Path
1. Navigate to your enterprise
2. Click **Insights** tab
3. In the left sidebar, click **Code generation**

### Charts & Metrics Available

| Chart | What It Shows |
|-------|--------------|
| Lines of Code Changed with AI | Total lines added + deleted across all modes (28 days) |
| Agent Contribution | % of lines added/deleted by agents (edit, agent, custom modes) |
| Average Lines Deleted by Agent | Average lines deleted by agents per active user this month |
| Daily Total of Lines Added/Deleted | Daily LoC across all modes |
| User-Initiated Code Changes | Lines from completions and chat panel actions (insert, copy, apply) |
| Agent-Initiated Code Changes | Lines automatically added/deleted by agents |
| User-Initiated per Model | User-initiated LoC grouped by model |
| Agent-Initiated per Model | Agent-initiated LoC grouped by model |
| User-Initiated per Language | User-initiated LoC grouped by language |
| Agent-Initiated per Language | Agent-initiated LoC grouped by language |

---

## 3. Organization-Level Dashboards

Same dashboards available at the organization level with these caveats:
- Org metrics are based on **org membership**, not where actions occur
- A user's usage appears in **every org they belong to**
- Organization-level analytics available starting **December 12, 2025**
- Org totals should NOT be compared directly to enterprise totals (no cross-org deduplication)

---

## 4. NDJSON Export for Custom Analysis

Export raw data from the dashboard for deeper analysis:

### Using Copilot Chat to Analyze Exports
After downloading NDJSON, you can ask Copilot Chat questions like:
- "Which users have `user_initiated_interaction_count` > 0 but low `code_acceptance_activity_count`?"
- "Are there specific teams with lower adoption rates?"
- "Show me users who used agent mode but not chat"
- "What's the acceptance rate trend over the last 4 weeks?"

### Programmatic Access
Use the Copilot Usage Metrics API to fetch NDJSON reports:
```bash
# Get download links
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  https://api.github.com/enterprises/ENTERPRISE/copilot/metrics/reports/enterprise-28-day/latest

# Download and analyze
curl -L "<download_url>" | jq .
```

---

## 5. Interpreting Dashboard Metrics

### Overall Usage Trends

| Metric | What It Shows | How to Interpret |
|--------|--------------|-----------------|
| IDE DAU | Unique daily users | Sustained growth = consistent engagement; sharp decline = config issues |
| IDE WAU | 7-day active users | WAU-to-license ratio > 60% = strong usage |
| Acceptance Rate | % suggestions accepted | Rising = growing trust; dropping = workflow friction |

### Feature Adoption

| Signal | What It Tells You | What to Look For |
|--------|------------------|-----------------|
| Requests per chat mode | Chat interactions by mode | Balanced distribution = exploring multiple features |
| Agent adoption | % users who used agent | Growth over time = advancing from basic to advanced |

### Acting on Insights

| Observation | Possible Cause | Suggested Action |
|-------------|---------------|-----------------|
| High adoption in some teams, low in others | Teams may not have Copilot enabled/configured | Verify license assignment & IDE setup; offer team onboarding |
| Steady usage but low agent adoption | Devs unaware of agent features | Share internal demos or success stories |
| Drop in DAU or acceptance rate | Config issues or reduced relevance | Encourage feedback; verify IDE and extension versions |
| High LoC suggested, low LoC accepted | Suggestions may be too verbose or off-target | Review language/framework-specific patterns |

> **Tip**: Combine dashboard trends with feedback from surveys or retrospectives
> for a full picture of Copilot's impact on developer productivity.
