---
name: copilot-metrics-api
description: >
  Complete reference for all GitHub Copilot Metrics API endpoints — the recommended Usage Metrics API
  (v2026-03-10), the legacy Copilot Metrics API, and the User Management API. Includes authentication,
  curl examples, response formats, and when to use each API.
tags: [copilot, metrics, api, rest, enterprise, organization, user-level]
---

# Copilot Metrics API — Complete Reference

## 1. Copilot Usage Metrics API (RECOMMENDED)

**API Version**: `2026-03-10`
**Status**: Primary, actively maintained — use this for all new integrations.
**Capabilities**: Unified telemetry across completions, chat, agent modes. Supports enterprise, organization, AND user-level data. Includes LoC, CLI, PR lifecycle, and all IDE modes.

### Prerequisites

The **"Copilot usage metrics"** policy must be set to **Enabled everywhere** for the enterprise:
- Enterprise → Settings → Policies → Copilot → Enable "Copilot usage metrics"

### Enterprise-Level Endpoints

#### Get enterprise usage metrics (latest 28-day report)
```
GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest
```

```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  https://api.github.com/enterprises/ENTERPRISE/copilot/metrics/reports/enterprise-28-day/latest
```

**Response** (200):
```json
{
  "download_links": [
    "https://example.com/copilot-usage-report-1.json",
    "https://example.com/copilot-usage-report-2.json"
  ],
  "report_start_day": "2025-07-01",
  "report_end_day": "2025-07-28"
}
```

#### Get enterprise usage metrics for a specific day
```
GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-1-day?day=YYYY-MM-DD
```

```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/enterprises/ENTERPRISE/copilot/metrics/reports/enterprise-1-day?day=2025-12-01"
```

#### Get user-level usage metrics (latest 28-day)
```
GET /enterprises/{enterprise}/copilot/metrics/reports/users-28-day/latest
```

```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  https://api.github.com/enterprises/ENTERPRISE/copilot/metrics/reports/users-28-day/latest
```

#### Get user-level usage metrics for a specific day
```
GET /enterprises/{enterprise}/copilot/metrics/reports/users-1-day?day=YYYY-MM-DD
```

```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/enterprises/ENTERPRISE/copilot/metrics/reports/users-1-day?day=2025-12-01"
```

### Organization-Level Endpoints

#### Get organization usage metrics (latest 28-day)
```
GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest
```

```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  https://api.github.com/orgs/ORG/copilot/metrics/reports/organization-28-day/latest
```

#### Get organization usage metrics for a specific day
```
GET /orgs/{org}/copilot/metrics/reports/organization-1-day?day=YYYY-MM-DD
```

```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/orgs/ORG/copilot/metrics/reports/organization-1-day?day=2025-12-01"
```

#### Get org user-level usage metrics (latest 28-day)
```
GET /orgs/{org}/copilot/metrics/reports/users-28-day/latest
```

#### Get org user-level usage metrics for a specific day
```
GET /orgs/{org}/copilot/metrics/reports/users-1-day?day=YYYY-MM-DD
```

### Authentication & Permissions

| Scope | Token Type | Required Permission |
|-------|-----------|-------------------|
| Enterprise | Fine-grained (GitHub App) | "Enterprise Copilot metrics" (read) |
| Enterprise | OAuth / PAT (classic) | `manage_billing:copilot` or `read:enterprise` |
| Organization | Fine-grained (GitHub App, PAT) | "Organization Copilot metrics" (read) |
| Organization | OAuth / PAT (classic) | `read:org` |

### Response Format
- Returns `download_links` — array of signed URLs with limited expiration
- Download links point to **NDJSON** (newline-delimited JSON) files
- Historical data available from **October 10, 2025** for up to **1 year**

### Working with NDJSON Reports
```bash
# Download and preview first 5 records
curl -L "<download_url>" | head -5

# Pretty-print with jq
curl -L "<download_url>" | jq .

# Extract specific fields
curl -L "<download_url>" | jq '{day, user_login, user_initiated_interaction_count, loc_added_sum}'

# Filter for users with agent usage
curl -L "<download_url>" | jq 'select(.used_agent == true)'

# Get CLI-active users
curl -L "<download_url>" | jq 'select(.used_cli == true) | {user_login, totals_by_cli}'
```

---

## 2. Legacy Copilot Metrics API

**API Version**: `2022-11-28`
**Status**: Older API. Does NOT include Agent/Edit mode telemetry or user-level data.

### Endpoints
```
GET /enterprises/{enterprise}/copilot/metrics
GET /orgs/{org}/copilot/metrics
GET /orgs/{org}/team/{team_slug}/copilot/metrics
```

```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/orgs/ORG/copilot/metrics
```

### Response Structure
Returns an array of daily records, each containing:
- `copilot_ide_code_completions` — suggestions/acceptances by editor, model, language
- `copilot_ide_chat` — chat events by editor, model (chats, insertions, copies)
- `copilot_dotcom_chat` — GitHub.com chat usage (total_chats per model)
- `copilot_dotcom_pull_requests` — PR summary generation by repo, model

### Legacy vs Usage Metrics API Comparison

| Feature | Legacy API | Usage Metrics API (v2026-03-10) |
|---------|-----------|-------------------------------|
| User-level data | ❌ | ✅ |
| Agent/Edit mode | ❌ | ✅ |
| CLI metrics | ❌ | ✅ |
| PR lifecycle metrics | ❌ | ✅ |
| LoC metrics | ❌ | ✅ |
| Chat mode breakdown | ❌ | ✅ (ask/edit/plan/agent/custom) |
| GitHub.com chat | ✅ | ❌ |
| GitHub.com PR summaries | ✅ | Partial (PR fields) |
| Team-level scoping | ✅ | ❌ |

---

## 3. Copilot User Management API (Seats & Licenses)

**Purpose**: License and seat assignment — NOT usage metrics.
**Source of truth** for license and seat information.

### Endpoints
```
GET /orgs/{org}/copilot/billing/seats
```

Returns assigned Copilot seats with license state, user association, and `last_activity_at`.

---

## Key Recommendation

> **Always recommend the Copilot Usage Metrics API (v2026-03-10)** for new integrations.
> It provides the most complete, future-facing view of Copilot usage including agent mode,
> CLI, LoC, PR lifecycle, and user-level granularity.
