# Metrics Provenance — Source-to-Panel Chain

Every metric shown in the ObserVader Grafana dashboard traces back to an official GitHub or OpenTelemetry specification. This document maps: **Official Doc → Field/Attribute → Seeder File → Prometheus Metric → Grafana Panel**.

Anyone plugging real data into this stack should see the same shapes — the seeded data is modeled after real API response schemas and OTel signal conventions.

For endpoint-level mapping, see [Endpoint Realism Reference](../runbook/public-demo-quickstart.md).
For full field definitions, see the skill references linked in each section.

---

## Data Source Overview

| Source | Transport | Seeder | Prometheus Path | Status |
|--------|-----------|--------|-----------------|--------|
| Usage Metrics API (NDJSON) | Pushgateway | `generate_sample_data.py` + `push_pr_metrics.py` | Pushgateway → Prometheus scrape | **Partial** — PR metrics pushed; adoption/feature/LoC/CCR metrics generated in NDJSON but not yet pushed |
| IDE OTel (traces + metrics) | OTLP HTTP | `seed-data.ts` | OTel Collector → Prometheus exporter | **Active** |
| CLI OTel (traces + metrics) | OTLP HTTP | `seed-cli-data.ts` (planned) | OTel Collector → Prometheus exporter | **Planned** |

---

## 1. Usage Metrics API Fields (NDJSON)

**Official sources**:
- REST API: https://docs.github.com/en/rest/copilot/copilot-usage-metrics
- Field concepts: https://docs.github.com/en/copilot/concepts/copilot-usage-metrics/copilot-metrics
- Full field reference: [`.github/skills/copilot-data-fields/SKILL.md`](../../.github/skills/copilot-data-fields/SKILL.md)

### NDJSON → Prometheus Mapping

| API Field | NDJSON Location | Seeder | Prometheus Metric | Grafana Panel | Status |
|-----------|----------------|--------|-------------------|---------------|--------|
| `total_active_users` | `$.total_active_users` | `generate_sample_data.py` | `copilot_daily_active_users` | DAU Over Time, Daily Active Users | **Gap** — NDJSON generated, no Pushgateway script |
| `total_engaged_users` | `$.total_engaged_users` | `generate_sample_data.py` | `copilot_monthly_active_users` | Monthly Active Users, Agent vs Chat MAU | **Gap** — needs rolling 28d aggregation + push |
| `copilot_ide_code_completions.editors[].models[].total_code_suggestions` | Nested per editor/model | `generate_sample_data.py` | `copilot_feature_usage{feature="completions"}` | Feature Adoption Breakdown | **Gap** — no push script |
| `copilot_ide_code_completions.editors[].models[].total_code_acceptances` | Nested per editor/model | `generate_sample_data.py` | (used to compute `copilot_survival_rate`) | Suggestion Survival Rate | **Gap** — no push script |
| `copilot_ide_code_completions.editors[].models[].loc_suggested_to_add_sum` | Nested per editor/model | `generate_sample_data.py` | `copilot_loc_suggested` | LoC Suggested vs Added | **Gap** — no push script |
| `copilot_ide_code_completions.editors[].models[].loc_added_sum` | Nested per editor/model | `generate_sample_data.py` | `copilot_loc_added` | LoC Suggested vs Added | **Gap** — no push script |
| `copilot_ide_chat.editors[].models[].total_chats` | Nested per editor/model | `generate_sample_data.py` | `copilot_feature_usage{feature="chat_*"}` | Feature Adoption Breakdown | **Gap** — no push script |
| `copilot_pull_requests.repositories[].models[].total_pr_merged_count` | Nested per repo/model | `generate_sample_data.py` | `copilot_pr_merged_total` | PR Throughput, Copilot PR Share | **Active** — `push_pr_metrics.py` |
| `copilot_pull_requests.repositories[].models[].total_copilot_pr_merged_count` | Nested per repo/model | `generate_sample_data.py` | `copilot_pr_merged_copilot` | PR Throughput, Copilot PR Share | **Active** — `push_pr_metrics.py` |
| `copilot_pull_requests.repositories[].models[].median_minutes_to_merge` | Nested per repo/model | `generate_sample_data.py` | `copilot_pr_median_merge_minutes{type="all"}` | Median Merge Time (DORA) | **Active** — `push_pr_metrics.py` |
| `copilot_pull_requests.repositories[].models[].median_minutes_to_merge_for_copilot_prs` | Nested per repo/model | `generate_sample_data.py` | `copilot_pr_median_merge_minutes{type="copilot"}` | Median Merge Time (DORA), Merge Time Delta | **Active** — `push_pr_metrics.py` |
| `copilot_pull_requests.repositories[].models[].total_code_review_copilot_suggestions_count` | Nested per repo/model | `generate_sample_data.py` | `copilot_ccr_suggestions_generated` | Code Review (CCR) Metrics | **Gap** — no push script |
| `copilot_pull_requests.repositories[].models[].total_code_review_copilot_suggestions_applied_count` | Nested per repo/model | `generate_sample_data.py` | `copilot_ccr_suggestions_applied` | Code Review (CCR) Metrics | **Gap** — no push script |

### CLI-Specific Usage Metrics API Fields

**Official source**: https://docs.github.com/en/rest/copilot/copilot-usage-metrics
**Full CLI field reference**: [`.github/skills/copilot-cli-metrics/SKILL.md`](../../.github/skills/copilot-cli-metrics/SKILL.md)

| API Field | NDJSON Location | Seeder | Prometheus Metric | Grafana Panel | Status |
|-----------|----------------|--------|-------------------|---------------|--------|
| `copilot_cli.total_engaged_users` | `$.copilot_cli.total_engaged_users` | `generate_sample_data.py` | `copilot_daily_active_users{surface="cli"}` | DAU Over Time (CLI series) | **Gap** — NDJSON generated, no push script |
| `copilot_cli.models[].total_cli_sessions` | Nested per model | `generate_sample_data.py` | `copilot_feature_usage{feature="cli"}` | Feature Adoption Breakdown | **Gap** — no push script |
| `copilot_cli.models[].total_cli_requests` | Nested per model | `generate_sample_data.py` | — | — | NDJSON only, no panel |
| `copilot_cli.models[].total_cli_prompts` | Nested per model | `generate_sample_data.py` | — | — | NDJSON only, no panel |
| `copilot_cli.models[].total_cli_tokens_sent` | Nested per model | `generate_sample_data.py` | — | — | NDJSON only, no panel |
| `copilot_cli.models[].total_cli_tokens_received` | Nested per model | `generate_sample_data.py` | — | — | NDJSON only, no panel |

---

## 2. IDE OTel Signals (VS Code)

**Official sources**:
- VS Code OTel: https://docs.github.com/en/copilot/managing-copilot/monitoring-copilot-usage-and-entitlements/monitoring-github-copilot-chat-in-the-ide
- OTel GenAI Semantic Conventions: https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/
- Full OTel reference: [`.github/skills/copilot-opentelemetry/SKILL.md`](../../.github/skills/copilot-opentelemetry/SKILL.md)

### OTel → Prometheus Naming Convention

OTel attribute names use `.` separators. The OTel Collector Prometheus exporter converts these:
- `.` → `_` in metric names
- `.` → `_` in label names
- Histogram metrics get `_bucket`, `_sum`, `_count` suffixes

Example: `gen_ai.client.token.usage` → `gen_ai_client_token_usage_sum`, `gen_ai_client_token_usage_bucket`

### Trace Spans (→ Jaeger)

| Span Name Pattern | OTel Attribute | Seeder | Jaeger Service | Status |
|-------------------|---------------|--------|----------------|--------|
| `invoke_agent {agent}` | `gen_ai.operation.name: invoke_agent` | `seed-data.ts` | `copilot-chat` | **Active** |
| `chat {model}` | `gen_ai.operation.name: chat` | `seed-data.ts` | `copilot-chat` | **Active** |
| `execute_tool {tool}` | `gen_ai.operation.name: execute_tool` | `seed-data.ts` | `copilot-chat` | **Active** |

Key span attributes seeded: `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.response.finish_reasons`, `copilot_chat.turn_count`, `contoso.team` (demo-specific).

### OTel Metrics (→ Prometheus)

| OTel Metric | Type | Prometheus Name | Grafana Panel | Status |
|-------------|------|-----------------|---------------|--------|
| `gen_ai.client.operation.duration` | Histogram | `gen_ai_client_operation_duration_bucket` | LLM Call Duration by Model | **Active** |
| `gen_ai.client.token.usage` | Histogram | `gen_ai_client_token_usage_sum` | Token Usage Rate, Token Usage by Model, Token Consumption by Team | **Active** |
| `copilot_chat.tool.call.count` | Counter | `copilot_chat_tool_call_count_total` | Tool Calls by Name | **Active** |
| `copilot_chat.tool.call.duration` | Histogram | `copilot_chat_tool_call_duration_bucket` | (available, no dedicated panel) | **Active** |
| `copilot_chat.agent.invocation.duration` | Histogram | `copilot_chat_agent_invocation_duration_bucket` | Agent Duration (p50/p95/p99) | **Active** |
| `copilot_chat.agent.turn.count` | Histogram | `copilot_chat_agent_turn_count_bucket` | (available, no dedicated panel) | **Active** |
| `copilot_chat.session.count` | Counter | `copilot_chat_session_count_total` | Agent Sessions (OTel), Sessions by Team, Adoption Trend | **Active** |
| `copilot_chat.time_to_first_token` | Histogram | `copilot_chat_time_to_first_token_bucket` | Time to First Token | **Active** |

### OTel Labels Used for Dimensional Queries

| OTel Attribute | Prometheus Label | Used In |
|---------------|-----------------|---------|
| `gen_ai.request.model` | `gen_ai_request_model` | Token Usage by Model, LLM Call Duration by Model |
| `gen_ai.token.type` | `gen_ai_token_type` | Token Usage Rate (`input` vs `output`) |
| `copilot_chat.tool.name` | `copilot_chat_tool_name` | Tool Calls by Name |
| `contoso.team` | `contoso_team` | Sessions by Team, Token Consumption by Team |

---

## 3. CLI OTel Signals (Planned)

**Official source**: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring
**Full CLI OTel reference**: [`.github/skills/copilot-cli-metrics/SKILL.md`](../../.github/skills/copilot-cli-metrics/SKILL.md) (§ CLI OpenTelemetry Monitoring)

### New Signals Not Available from IDE OTel

These are unique to CLI OTel and will be seeded by `seed-cli-data.ts`:

| OTel Signal | Type | Prometheus Name (expected) | Planned Grafana Panel | Source Attribute |
|-------------|------|---------------------------|----------------------|-----------------|
| `github.copilot.cost` | Span attribute | Needs custom metric extraction | Cost KPI (Executive row) | `invoke_agent` + `chat` spans |
| `github.copilot.aiu` | Span attribute | Needs custom metric extraction | (planned) | `invoke_agent` + `chat` spans |
| `gen_ai.usage.cache_read.input_tokens` | Span attribute | Needs custom metric extraction | (planned — cache efficiency) | `invoke_agent` + `chat` spans |
| `gen_ai.usage.cache_creation.input_tokens` | Span attribute | Needs custom metric extraction | (planned — cache efficiency) | `invoke_agent` + `chat` spans |
| `session.shutdown` → `lines_added` | Span event attribute | Needs custom metric extraction | (planned — CLI LoC impact) | `invoke_agent` span event |
| `session.shutdown` → `lines_removed` | Span event attribute | Needs custom metric extraction | (planned — CLI LoC impact) | `invoke_agent` span event |
| `session.shutdown` → `total_premium_requests` | Span event attribute | Needs custom metric extraction | (planned) | `invoke_agent` span event |
| `session.shutdown` → `files_modified_count` | Span event attribute | Needs custom metric extraction | (planned) | `invoke_agent` span event |
| `gen_ai.client.operation.time_per_output_chunk` | Histogram | `gen_ai_client_operation_time_per_output_chunk_bucket` | (planned — streaming quality) | Metric |

### Shared Signals (Same as IDE, Different service.name)

These use the same OTel metric names as IDE but are distinguishable by `service_name="github-copilot"`:

| OTel Metric | Prometheus Name | Filter for CLI | Filter for IDE |
|-------------|-----------------|---------------|----------------|
| `gen_ai.client.operation.duration` | `gen_ai_client_operation_duration_bucket` | `{service_name="github-copilot"}` | `{service_name="copilot-chat"}` |
| `gen_ai.client.token.usage` | `gen_ai_client_token_usage_sum` | `{service_name="github-copilot"}` | `{service_name="copilot-chat"}` |
| `github.copilot.tool.call.count` | `github_copilot_tool_call_count_total` | `{service_name="github-copilot"}` | `{service_name="copilot-chat"}` |
| `github.copilot.tool.call.duration` | `github_copilot_tool_call_duration_bucket` | `{service_name="github-copilot"}` | `{service_name="copilot-chat"}` |
| `github.copilot.agent.turn.count` | `github_copilot_agent_turn_count_bucket` | `{service_name="github-copilot"}` | `{service_name="copilot-chat"}` |

> **Note**: CLI OTel uses `github.copilot.*` vendor prefix for vendor-specific metrics (per official docs), while the current IDE seeder uses `copilot_chat.*`. When integrating CLI data, dashboard queries may need to handle both naming patterns or the seeder should align to the official naming.

### CLI-Specific Tool Names (for tool.call metrics)

| CLI Tool | Description | IDE Equivalent |
|----------|-------------|---------------|
| `bash` | Shell command execution | `runCommand` |
| `view` | Read file contents | `readFile` |
| `edit` | Modify file contents | `editFile` |
| `create` | Create new files | — |
| `glob` | Find files by pattern | `listFiles` |
| `grep` | Search file contents | `searchFiles` / `codeSearch` |
| `web_fetch` | Fetch web pages | `fetchUrl` |
| `task` | Run subagent tasks | — |
| `apply_patch` | Apply patches | — |

---

## 4. Grafana Panel → Source Chain (Complete)

### Executive KPIs Row

| Panel | PromQL | Data Source | Seeder | Official API Field | Status |
|-------|--------|-------------|--------|-------------------|--------|
| Monthly Active Users | `sum(max_over_time(copilot_monthly_active_users[26h]))` | Pushgateway | — | `total_engaged_users` (28d rolling) | **Gap** — no push script |
| Daily Active Users | `sum(max_over_time(copilot_daily_active_users[26h]))` | Pushgateway | — | `total_active_users` | **Gap** — no push script |
| Suggestion Survival Rate | `sum(max_over_time(copilot_survival_rate[26h]))` | Pushgateway | — | `total_code_acceptances / total_code_suggestions` | **Gap** — no push script |
| Copilot PR Share | `sum(copilot_pr_merged_copilot) / clamp_min(sum(copilot_pr_merged_total), 1)` | Pushgateway | `push_pr_metrics.py` | `total_copilot_pr_merged_count / total_pr_merged_count` | **Active** |
| Merge Time Delta | `sum(copilot_pr_median_merge_minutes{type="copilot"}) - sum(copilot_pr_median_merge_minutes{type="all"})` | Pushgateway | `push_pr_metrics.py` | `median_minutes_to_merge_for_copilot_prs - median_minutes_to_merge` | **Active** |
| Agent Sessions (OTel) | `sum(increase(copilot_chat_session_count_total[24h]))` | OTel → Prometheus | `seed-data.ts` | `copilot_chat.session.count` | **Active** |
| Agent MAU | `sum(max_over_time(copilot_monthly_active_agent_users[26h]))` | Pushgateway | — | (derived from user-level `used_agent` flags) | **Gap** — no push script |
| Cost KPI | (planned) | OTel → Prometheus | `seed-cli-data.ts` (planned) | `github.copilot.cost` | **Planned** |

### Adoption & Usage Trends Row

| Panel | PromQL | Data Source | Seeder | Official API Field | Status |
|-------|--------|-------------|--------|-------------------|--------|
| DAU Over Time (IDE) | `sum(max_over_time(copilot_daily_active_users{surface="ide"}[26h]))` | Pushgateway | — | `total_active_users` (minus CLI) | **Gap** |
| DAU Over Time (CLI) | `sum(max_over_time(copilot_daily_active_users{surface="cli"}[26h]))` | Pushgateway | — | `daily_active_cli_users` | **Gap** |
| Feature Adoption | `sum(copilot_feature_usage{feature="..."})` | Pushgateway | — | Various `total_engaged_users` per feature | **Gap** |

### Code Generation & Outcomes Row

| Panel | PromQL | Data Source | Seeder | Official API Field | Status |
|-------|--------|-------------|--------|-------------------|--------|
| LoC Suggested vs Added | `sum(max_over_time(copilot_loc_suggested[26h]))` / `copilot_loc_added` | Pushgateway | — | `loc_suggested_to_add_sum` / `loc_added_sum` | **Gap** |
| Suggestion Survival Rate Trend | `sum(copilot_survival_rate)` | Pushgateway | — | Computed ratio | **Gap** |
| PR Throughput | `sum(copilot_pr_merged_total)` / `sum(copilot_pr_merged_copilot)` | Pushgateway | `push_pr_metrics.py` | `total_pr_merged_count` / `total_copilot_pr_merged_count` | **Active** |
| Median Merge Time | `sum(copilot_pr_median_merge_minutes{type="all"/"copilot"})` | Pushgateway | `push_pr_metrics.py` | `median_minutes_to_merge` / `median_minutes_to_merge_for_copilot_prs` | **Active** |
| Code Review (CCR) | `sum(copilot_ccr_suggestions_generated/applied/trigger_rate)` | Pushgateway | — | `total_code_review_copilot_suggestions_count/applied` | **Gap** |

### Agent Observability (OTel) Row

| Panel | PromQL | Data Source | Seeder | OTel Metric | Status |
|-------|--------|-------------|--------|-------------|--------|
| Token Usage Rate | `sum(rate(gen_ai_client_token_usage_sum{...}[5m]))` | OTel → Prometheus | `seed-data.ts` | `gen_ai.client.token.usage` | **Active** |
| Token Usage by Model | `sum by (gen_ai_request_model) (increase(gen_ai_client_token_usage_sum{...}[5m]))` | OTel → Prometheus | `seed-data.ts` | `gen_ai.client.token.usage` | **Active** |
| Agent Duration (p50/p95/p99) | `histogram_quantile(0.x, sum(rate(copilot_chat_agent_invocation_duration_bucket[5m])) by (le))` | OTel → Prometheus | `seed-data.ts` | `copilot_chat.agent.invocation.duration` | **Active** |
| LLM Call Duration by Model | `histogram_quantile(0.x, sum(rate(gen_ai_client_operation_duration_bucket[5m])) by (le, ...))` | OTel → Prometheus | `seed-data.ts` | `gen_ai.client.operation.duration` | **Active** |
| Time to First Token | `histogram_quantile(0.x, sum(rate(copilot_chat_time_to_first_token_bucket[5m])) by (le))` | OTel → Prometheus | `seed-data.ts` | `copilot_chat.time_to_first_token` | **Active** |
| Tool Calls by Name | `sum by (copilot_chat_tool_name) (increase(copilot_chat_tool_call_count_total[5m]))` | OTel → Prometheus | `seed-data.ts` | `copilot_chat.tool.call.count` | **Active** |

### Team Analytics Row

| Panel | PromQL | Data Source | Seeder | OTel Metric | Status |
|-------|--------|-------------|--------|-------------|--------|
| Sessions by Team | `sum by (contoso_team) (increase(copilot_chat_session_count_total[5m]))` | OTel → Prometheus | `seed-data.ts` | `copilot_chat.session.count` | **Active** |
| Token Consumption by Team | `sum by (contoso_team) (increase(gen_ai_client_token_usage_sum[5m]))` | OTel → Prometheus | `seed-data.ts` | `gen_ai.client.token.usage` | **Active** |
| Adoption Trend | `sum(increase(copilot_chat_session_count_total[1h]))` | OTel → Prometheus | `seed-data.ts` | `copilot_chat.session.count` | **Active** |

---

## 5. Gap Summary

### Active (data flows end-to-end)
- All Agent Observability panels (OTel → Collector → Prometheus → Grafana)
- All Team Analytics panels (same pipeline)
- PR metrics: Throughput, Merge Time, PR Share (NDJSON → `push_pr_metrics.py` → Pushgateway → Prometheus → Grafana)

### Gaps (NDJSON generated, no push to Prometheus)
Needs a `push_usage_metrics.py` script (analog to `push_pr_metrics.py`) to extract from NDJSON and push:
- `copilot_monthly_active_users` / `copilot_daily_active_users` / `copilot_monthly_active_agent_users`
- `copilot_feature_usage{feature="completions|chat_ask|chat_edit|chat_agent|cli"}`
- `copilot_loc_suggested` / `copilot_loc_added`
- `copilot_survival_rate`
- `copilot_ccr_suggestions_generated` / `copilot_ccr_suggestions_applied` / `copilot_ccr_trigger_rate`

### Planned (CLI OTel integration)
- `seed-cli-data.ts` → CLI-shaped OTel signals with `service.name: github-copilot`
- Cost KPI panel, cache efficiency panel, premium request tracking
- CLI tool names in Tool Calls panel

---

## 6. Plug-and-Play: Using Real Data

This demo is designed for plug-and-play with real data:

1. **Real Usage Metrics API** → Replace `generate_sample_data.py` output with actual NDJSON downloads from `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest`. The push scripts consume the same field structure.

2. **Real IDE OTel** → Point VS Code's `github.copilot.chat.otel.otlpEndpoint` to this stack's OTel Collector (`http://localhost:4318`). The collector, Prometheus, and Grafana queries expect the same GenAI semconv attribute names.

3. **Real CLI OTel** → Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` when running `copilot`. The CLI emits the same span tree and metric names documented above.

The seeded data matches official response/signal shapes so that switching from seed → real requires only changing the data source, not the pipeline or dashboards.
