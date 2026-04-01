---
name: copilot-cli-metrics
description: >
  Copilot CLI-specific metrics — what's tracked, where to find the data, and how CLI metrics
  relate to (and are independent of) IDE metrics. Includes field reference, API access examples,
  and analysis patterns.
tags: [copilot, cli, metrics, api, sessions, tokens]
---

# Copilot CLI Metrics — Complete Reference

## Overview

Copilot CLI metrics track usage of GitHub Copilot via the command-line interface.

**Key principle**: CLI metrics are **completely independent** of IDE metrics:
- `daily_active_cli_users` is NOT included in IDE DAU/WAU counts
- `totals_by_cli` is NOT reflected in `totals_by_ide` or `totals_by_feature`
- CLI metrics do NOT appear in the Copilot Usage Dashboard (API-only)
- Fields are omitted entirely when there is no CLI usage for that day

---

## CLI Metrics Fields

### Enterprise/Organization Scope

| Field | Description |
|-------|------------|
| `daily_active_cli_users` | Number of unique users who used Copilot CLI on a given day. Independent of IDE active user counts. |

### Detailed CLI Metrics (`totals_by_cli` Object)

| Field | Description |
|-------|------------|
| `totals_by_cli.session_count` | Number of distinct CLI sessions initiated on this day |
| `totals_by_cli.request_count` | Total requests made via CLI, including both user-initiated prompts AND automated agentic follow-up calls |
| `totals_by_cli.prompt_count` | Total user prompts, commands, or queries executed within sessions |
| `totals_by_cli.token_usage.output_tokens_sum` | Total output tokens generated across all CLI requests |
| `totals_by_cli.token_usage.prompt_tokens_sum` | Total prompt tokens sent across all CLI requests |
| `totals_by_cli.token_usage.avg_tokens_per_request` | Average tokens per request: `(output_tokens_sum + prompt_tokens_sum) ÷ request_count` |
| `totals_by_cli.last_known_cli_version` | Most recent Copilot CLI version detected for the user that day |

### User-Level Scope

| Field | Description |
|-------|------------|
| `used_cli` | Boolean — whether the user used Copilot CLI that day |

---

## Accessing CLI Metrics

CLI metrics are available **only** through the Copilot Usage Metrics API (v2026-03-10).

### Enterprise-Level CLI Data

```bash
# Get enterprise report for a specific day
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/enterprises/ENTERPRISE/copilot/metrics/reports/enterprise-1-day?day=2025-12-01"

# Download the NDJSON and extract CLI data
curl -L "<download_url>" | jq 'select(.daily_active_cli_users != null) | {day: .day, cli_users: .daily_active_cli_users, cli_details: .totals_by_cli}'
```

### User-Level CLI Data

```bash
# Get user-level report
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/enterprises/ENTERPRISE/copilot/metrics/reports/users-1-day?day=2025-12-01"

# Filter for CLI-active users
curl -L "<download_url>" | jq 'select(.used_cli == true) | {user_login, used_cli, totals_by_cli}'
```

### Organization-Level CLI Data

```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/orgs/ORG/copilot/metrics/reports/organization-1-day?day=2025-12-01"
```

---

## Analysis Patterns

### CLI Adoption Rate
```bash
# Compare CLI users to total active users
curl -L "<download_url>" | jq '{
  day: .day,
  total_active: (.daily_active_cli_users // 0),
  cli_adoption_note: "Compare daily_active_cli_users against total active users from IDE metrics"
}'
```

### Token Usage Analysis
```bash
# Analyze token consumption patterns
curl -L "<download_url>" | jq 'select(.totals_by_cli != null) | {
  sessions: .totals_by_cli.session_count,
  requests: .totals_by_cli.request_count,
  prompts: .totals_by_cli.prompt_count,
  output_tokens: .totals_by_cli.token_usage.output_tokens_sum,
  prompt_tokens: .totals_by_cli.token_usage.prompt_tokens_sum,
  avg_tokens: .totals_by_cli.token_usage.avg_tokens_per_request
}'
```

### Agentic vs User-Initiated Requests
```bash
# request_count includes agentic follow-ups; prompt_count is user-only
# The difference indicates agentic activity
curl -L "<download_url>" | jq 'select(.totals_by_cli != null) | {
  user_prompts: .totals_by_cli.prompt_count,
  total_requests: .totals_by_cli.request_count,
  agentic_requests: (.totals_by_cli.request_count - .totals_by_cli.prompt_count)
}'
```

---

## Important Notes

1. **Dashboard gap**: CLI metrics are NOT shown in the Copilot Usage Dashboard — you must use the API
2. **Independent counting**: A user active on both CLI and IDE is counted separately in each
3. **Omitted when empty**: `daily_active_cli_users` and `totals_by_cli` are omitted from reports when there's no CLI usage that day
4. **request_count vs prompt_count**: `request_count` includes automated agentic follow-up calls; `prompt_count` is user-initiated only
5. **Version tracking**: `last_known_cli_version` helps identify users on outdated CLI versions
