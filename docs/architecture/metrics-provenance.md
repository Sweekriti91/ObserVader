# Metrics Provenance — Source-to-Panel Chain

Every metric shown in the ObserVader Grafana dashboards traces back to an official GitHub or OpenTelemetry specification. This document maps: **Official Doc → Field/Attribute → Seeder File → Prometheus Metric → Grafana Panel**.

Two dashboards:
- **Copilot Metrics — Unified Dashboard**: Adoption, code generation, agent observability, team analytics
- **Copilot ROI & Cost Efficiency**: Cost, cache efficiency, productivity impact (CLI OTel data)

Anyone plugging real data into this stack should see the same shapes — the seeded data is modeled after real API response schemas and OTel signal conventions.

For endpoint-level mapping, see [Endpoint Realism Reference](../runbook/public-demo-quickstart.md).
For Grafana panel-level formula/query inspection steps and interpretation guidance, see [Inspect Panel Formula, APIs, and Provenance in Grafana](../runbook/public-demo-quickstart.md#inspect-panel-formula-apis-and-provenance-in-grafana).
For full field definitions, see the skill references linked in each section.

---

## Data Source Overview

| Source | Transport | Seeder | Prometheus Path | Status |
|--------|-----------|--------|-----------------|--------|
| Usage Metrics API (NDJSON) | Pushgateway + Remote Write | `generate_sample_data.py` + `push_pr_metrics.py` + `push_usage_metrics.py` | Remote Write (28-day backfill) + Pushgateway (latest day) | **Active** — Full 28-day time series via `prom_remote_write.py` |
| IDE OTel (traces + metrics) | OTLP HTTP | `seed-data.ts` | OTel Collector → Prometheus exporter | **Active** |
| CLI OTel (traces + metrics) | OTLP HTTP | `seed-cli-data.ts` | OTel Collector → Prometheus exporter | **Active** |

---

## 1. Usage Metrics API Fields (NDJSON)

**Official sources**:
- REST API: https://docs.github.com/en/rest/copilot/copilot-usage-metrics
- Field concepts: https://docs.github.com/en/copilot/concepts/copilot-usage-metrics/copilot-metrics
- Lines of Code metrics guide: https://docs.github.com/en/copilot/reference/copilot-usage-metrics/lines-of-code-metrics
- Reconciling metrics across sources: https://docs.github.com/en/copilot/reference/copilot-usage-metrics/reconciling-usage-metrics
- Example NDJSON schema: https://docs.github.com/en/copilot/reference/copilot-usage-metrics/example-schema
- Full field reference: [`.github/skills/copilot-data-fields/SKILL.md`](../../.github/skills/copilot-data-fields/SKILL.md)

### NDJSON → Prometheus Mapping

| API Field | NDJSON Location | Seeder | Prometheus Metric | Grafana Panel | Status |
|-----------|----------------|--------|-------------------|---------------|--------|
| `total_active_users` | `$.total_active_users` | `generate_sample_data.py` | `copilot_daily_active_users` | DAU Over Time, Daily Active Users | **Active** — `push_usage_metrics.py` |
| `total_engaged_users` | `$.total_engaged_users` | `generate_sample_data.py` | `copilot_monthly_active_users` | Monthly Active Users, Agent vs Chat MAU | **Active** — `push_usage_metrics.py` |
| `copilot_ide_code_completions.editors[].models[].total_code_suggestions` | Nested per editor/model | `generate_sample_data.py` | `copilot_feature_usage{feature="completions"}` | Feature Adoption Breakdown | **Active** — `push_usage_metrics.py` |
| `copilot_ide_code_completions.editors[].models[].total_code_acceptances` | Nested per editor/model | `generate_sample_data.py` | (used to compute `copilot_survival_rate`) | Suggestion Survival Rate | **Active** — `push_usage_metrics.py` |
| `copilot_ide_code_completions.editors[].models[].loc_suggested_to_add_sum` | Nested per editor/model | `generate_sample_data.py` | `copilot_loc_suggested` | LoC Suggested vs Added | **Active** — `push_usage_metrics.py` |
| `copilot_ide_code_completions.editors[].models[].loc_added_sum` | Nested per editor/model | `generate_sample_data.py` | `copilot_loc_added` | LoC Suggested vs Added | **Active** — `push_usage_metrics.py` |
| `copilot_ide_chat.editors[].models[].total_chats` | Nested per editor/model | `generate_sample_data.py` | `copilot_feature_usage{feature="chat_*"}` | Feature Adoption Breakdown | **Active** — `push_usage_metrics.py` |
| `copilot_pull_requests.repositories[].models[].total_pr_merged_count` | Nested per repo/model | `generate_sample_data.py` | `copilot_pr_merged_total` | PR Throughput, Copilot PR Share | **Active** — `push_pr_metrics.py` |
| `copilot_pull_requests.repositories[].models[].total_copilot_pr_merged_count` | Nested per repo/model | `generate_sample_data.py` | `copilot_pr_merged_copilot` | PR Throughput, Copilot PR Share | **Active** — `push_pr_metrics.py` |
| `copilot_pull_requests.repositories[].models[].median_minutes_to_merge` | Nested per repo/model | `generate_sample_data.py` | `copilot_pr_median_merge_minutes{type="all"}` | Median Merge Time (DORA) | **Active** — `push_pr_metrics.py` |
| `copilot_pull_requests.repositories[].models[].median_minutes_to_merge_for_copilot_prs` | Nested per repo/model | `generate_sample_data.py` | `copilot_pr_median_merge_minutes{type="copilot"}` | Median Merge Time (DORA), Merge Time Delta | **Active** — `push_pr_metrics.py` |
| `copilot_pull_requests.repositories[].models[].total_code_review_copilot_suggestions_count` | Nested per repo/model | `generate_sample_data.py` | `copilot_ccr_suggestions_generated` | Code Review (CCR) Metrics | **Active** — `push_usage_metrics.py` |
| `copilot_pull_requests.repositories[].models[].total_code_review_copilot_suggestions_applied_count` | Nested per repo/model | `generate_sample_data.py` | `copilot_ccr_suggestions_applied` | Code Review (CCR) Metrics | **Active** — `push_usage_metrics.py` |

### CLI-Specific Usage Metrics API Fields

**Official source**: https://docs.github.com/en/rest/copilot/copilot-usage-metrics
**Full CLI field reference**: [`.github/skills/copilot-cli-metrics/SKILL.md`](../../.github/skills/copilot-cli-metrics/SKILL.md)

| API Field | NDJSON Location | Seeder | Prometheus Metric | Grafana Panel | Status |
|-----------|----------------|--------|-------------------|---------------|--------|
| `copilot_cli.total_engaged_users` | `$.copilot_cli.total_engaged_users` | `generate_sample_data.py` | `copilot_daily_active_users{surface="cli"}` | DAU Over Time (CLI series) | **Active** — `push_usage_metrics.py` |
| `copilot_cli.models[].total_cli_sessions` | Nested per model | `generate_sample_data.py` | `copilot_feature_usage{feature="cli"}` | Feature Adoption Breakdown | **Active** — `push_usage_metrics.py` |
| `copilot_cli.models[].total_cli_requests` | Nested per model | `generate_sample_data.py` | — | — | NDJSON only, no panel |
| `copilot_cli.models[].total_cli_prompts` | Nested per model | `generate_sample_data.py` | — | — | NDJSON only, no panel |
| `copilot_cli.models[].total_cli_tokens_sent` | Nested per model | `generate_sample_data.py` | — | — | NDJSON only, no panel |
| `copilot_cli.models[].total_cli_tokens_received` | Nested per model | `generate_sample_data.py` | — | — | NDJSON only, no panel |

---

## 2. IDE OTel Signals (VS Code)

**Official sources**:
- Copilot OTel Monitoring: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring
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

## 3. CLI OTel Signals

**Official source**: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring
**Full CLI OTel reference**: [`.github/skills/copilot-cli-metrics/SKILL.md`](../../.github/skills/copilot-cli-metrics/SKILL.md) (§ CLI OpenTelemetry Monitoring)

### CLI-Unique OTel Metrics (seeded by `seed-cli-data.ts`)

| OTel Metric | Type | Prometheus Name | ROI Dashboard Panel | Status |
|-------------|------|-----------------|---------------------|--------|
| `github.copilot.cost` | Histogram | `github_copilot_cost_sum` | Total Cost (7d), Cost per Session, Cost per LoC, Cost Over Time, Cost by Model, Cost by Team, Cost per Session Trend | **Active** |
| `github.copilot.aiu` | Histogram | `github_copilot_aiu_sum` | AI Units (7d), AI Units by Model | **Active** |
| `github.copilot.cache_read_tokens` | Histogram | `github_copilot_cache_read_tokens_sum` | Cache Hit Ratio, Cache Hit Ratio Over Time, Token Cache Breakdown | **Active** |
| `github.copilot.cache_creation_tokens` | Histogram | `github_copilot_cache_creation_tokens_sum` | Cache Hit Ratio, Token Cache Breakdown | **Active** |
| `github.copilot.session.lines_added` | Histogram | `github_copilot_session_lines_added_sum` | Lines Added (CLI, 7d), CLI Lines Added Over Time, Cost per LoC, LoC per Session | **Active** |
| `github.copilot.session.lines_removed` | Histogram | `github_copilot_session_lines_removed_sum` | Lines Removed (CLI, 7d), CLI Lines Added Over Time | **Active** |
| `github.copilot.session.files_modified` | Histogram | `github_copilot_session_files_modified_sum` | Files Modified (CLI, 7d) | **Active** |
| `github.copilot.session.premium_requests` | Histogram | `github_copilot_session_premium_requests_sum` | Premium Requests (7d), Premium Requests Over Time | **Active** |
| `gen_ai.client.operation.time_per_output_chunk` | Histogram | `gen_ai_client_operation_time_per_output_chunk_bucket` | (available, no dedicated panel) | **Active** |

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
| Monthly Active Users | `sum(max_over_time(copilot_monthly_active_users[26h]))` | Pushgateway | `push_usage_metrics.py` | `total_engaged_users` (28d rolling) | **Active** |
| Daily Active Users | `sum(max_over_time(copilot_daily_active_users[26h]))` | Pushgateway | `push_usage_metrics.py` | `total_active_users` | **Active** |
| Suggestion Survival Rate | `sum(max_over_time(copilot_survival_rate[26h]))` | Pushgateway | `push_usage_metrics.py` | `total_code_acceptances / total_code_suggestions` | **Active** |
| Copilot PR Share | `sum(copilot_pr_merged_copilot) / clamp_min(sum(copilot_pr_merged_total), 1)` | Pushgateway | `push_pr_metrics.py` | `total_copilot_pr_merged_count / total_pr_merged_count` | **Active** |
| Merge Time Delta | `sum(copilot_pr_median_merge_minutes{type="copilot"}) - sum(copilot_pr_median_merge_minutes{type="all"})` | Pushgateway | `push_pr_metrics.py` | `median_minutes_to_merge_for_copilot_prs - median_minutes_to_merge` | **Active** |
| Agent Sessions (OTel) | `sum(increase(copilot_chat_session_count_total[24h]))` | OTel → Prometheus | `seed-data.ts` | `copilot_chat.session.count` | **Active** |
| Agent MAU | `sum(max_over_time(copilot_monthly_active_agent_users[26h]))` | Pushgateway | `push_usage_metrics.py` | (derived from user-level `used_agent` flags) | **Active** |

### Adoption & Usage Trends Row

| Panel | PromQL | Data Source | Seeder | Official API Field | Status |
|-------|--------|-------------|--------|-------------------|--------|
| DAU Over Time (IDE) | `sum(max_over_time(copilot_daily_active_users{surface="ide"}[26h]))` | Pushgateway | `push_usage_metrics.py` | `total_active_users` (minus CLI) | **Active** |
| DAU Over Time (CLI) | `sum(max_over_time(copilot_daily_active_users{surface="cli"}[26h]))` | Pushgateway | `push_usage_metrics.py` | `daily_active_cli_users` | **Active** |
| Feature Adoption | `sum(max_over_time(copilot_feature_usage{feature="..."}[26h]))` | Remote Write | `push_usage_metrics.py` | Various `total_engaged_users` per feature | **Active** |

### Code Generation & Outcomes Row

| Panel | PromQL | Data Source | Seeder | Official API Field | Status |
|-------|--------|-------------|--------|-------------------|--------|
| LoC Suggested vs Added | `sum(max_over_time(copilot_loc_suggested[26h]))` / `copilot_loc_added` | Pushgateway | `push_usage_metrics.py` | `loc_suggested_to_add_sum` / `loc_added_sum` | **Active** |
| Suggestion Survival Rate Trend | `max_over_time(copilot_survival_rate[26h])` | Remote Write | `push_usage_metrics.py` | Computed ratio | **Active** |
| PR Throughput | `sum(max_over_time(copilot_pr_merged_total[26h]))` / `sum(max_over_time(copilot_pr_merged_copilot[26h]))` | Remote Write | `push_pr_metrics.py` | `total_pr_merged_count` / `total_copilot_pr_merged_count` | **Active** |
| Median Merge Time | `sum(max_over_time(copilot_pr_median_merge_minutes{type="all"/"copilot"}[26h]))` | Remote Write | `push_pr_metrics.py` | `median_minutes_to_merge` / `median_minutes_to_merge_for_copilot_prs` | **Active** |
| Code Review (CCR) | `sum(max_over_time(copilot_ccr_suggestions_generated[26h]))` / etc. | Remote Write | `push_usage_metrics.py` | `total_code_review_copilot_suggestions_count/applied` | **Active** |
| Active vs Passive CCR Users | `sum(max_over_time(copilot_ccr_users{type="active/passive",window="daily/monthly"}[26h]))` | Remote Write | `push_usage_metrics.py` | `daily/monthly_active/passive_copilot_code_review_users` | **Active** |

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

### ROI & Cost Efficiency Dashboard (separate)

#### Cost KPIs Row

| Panel | PromQL | Data Source | Seeder | OTel Metric | Status |
|-------|--------|-------------|--------|-------------|--------|
| Total Cost (7d) | `sum(increase(github_copilot_cost_sum[7d]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.cost` | **Active** |
| Cost per Session | `sum(increase(github_copilot_cost_sum[7d])) / clamp_min(sum(increase(github_copilot_cost_count[7d])), 1)` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.cost` | **Active** |
| Cost per LoC | `sum(increase(github_copilot_cost_sum[7d])) / clamp_min(sum(increase(github_copilot_session_lines_added_sum[7d])), 1)` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.cost` + `github.copilot.session.lines_added` | **Active** |
| AI Units (7d) | `sum(increase(github_copilot_aiu_sum[7d]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.aiu` | **Active** |
| Premium Requests (7d) | `sum(increase(github_copilot_session_premium_requests_sum[7d]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.session.premium_requests` | **Active** |
| Cache Hit Ratio | `cache_read / (cache_read + cache_creation + fresh_input)` | OTel → Prometheus | `seed-cli-data.ts` | Cache token metrics | **Active** |

#### Cost Trends Row

| Panel | PromQL | Data Source | Seeder | OTel Metric | Status |
|-------|--------|-------------|--------|-------------|--------|
| Cost Over Time | `sum(increase(github_copilot_cost_sum[1h]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.cost` | **Active** |
| Cost by Model | `sum by (gen_ai_request_model) (increase(github_copilot_cost_sum[1h]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.cost` | **Active** |
| Cost by Team | `sum by (contoso_team) (increase(github_copilot_cost_sum[1h]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.cost` | **Active** |
| AI Units by Model | `sum by (gen_ai_request_model) (increase(github_copilot_aiu_sum[1h]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.aiu` | **Active** |

#### Cache & Efficiency Row

| Panel | PromQL | Data Source | Seeder | OTel Metric | Status |
|-------|--------|-------------|--------|-------------|--------|
| Cache Hit Ratio Over Time | `cache_read / (cache_read + cache_creation + fresh_input)` | OTel → Prometheus | `seed-cli-data.ts` | Cache token metrics | **Active** |
| Premium Requests Over Time | `sum(increase(github_copilot_session_premium_requests_sum[1h]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.session.premium_requests` | **Active** |
| Token Cache Breakdown | Cache read / creation / fresh input stacked | OTel → Prometheus | `seed-cli-data.ts` | Cache token metrics | **Active** |
| Cost per Session Trend | `sum(increase(cost_sum[1h])) / clamp_min(sum(increase(cost_count[1h])), 1)` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.cost` | **Active** |

#### Productivity Impact Row

| Panel | PromQL | Data Source | Seeder | OTel/API Metric | Status |
|-------|--------|-------------|--------|-----------------|--------|
| Lines Added (CLI, 7d) | `sum(increase(github_copilot_session_lines_added_sum[7d]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.session.lines_added` | **Active** |
| Lines Removed (CLI, 7d) | `sum(increase(github_copilot_session_lines_removed_sum[7d]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.session.lines_removed` | **Active** |
| Files Modified (CLI, 7d) | `sum(increase(github_copilot_session_files_modified_sum[7d]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.session.files_modified` | **Active** |
| LoC per Session | `lines_added / sessions` | OTel → Prometheus | `seed-cli-data.ts` | Computed | **Active** |
| Copilot PR Share | `sum(copilot_pr_merged_copilot) / sum(copilot_pr_merged_total)` | Pushgateway | `push_pr_metrics.py` | Usage Metrics API | **Active** |
| Merge Time Δ | `copilot_ttm - all_ttm` | Pushgateway | `push_pr_metrics.py` | Usage Metrics API | **Active** |
| CLI Lines Added Over Time | Lines added/removed timeseries | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.session.lines_*` | **Active** |
| CLI Tool Distribution | `sum by (gen_ai_tool_name) (increase(github_copilot_tool_call_count_total[1h]))` | OTel → Prometheus | `seed-cli-data.ts` | `github.copilot.tool.call.count` | **Active** |

---

## 5. Status Summary

### All Active
- **Unified Dashboard**: All 29 panels have data flowing end-to-end
  - NDJSON → `push_pr_metrics.py` + `push_usage_metrics.py` → Pushgateway → Prometheus → Grafana
  - IDE OTel → `seed-data.ts` → OTel Collector → Prometheus → Grafana
- **ROI Dashboard**: All 20 panels have data flowing end-to-end
  - CLI OTel → `seed-cli-data.ts` → OTel Collector → Prometheus → Grafana
  - Plus cross-referenced PR metrics from Pushgateway

### Remaining Limitations
- `copilot_monthly_active_users` is approximated from max engaged across available days
- `copilot_monthly_active_agent_users` is estimated as 40% of chat users (no per-user `used_agent` flag in NDJSON)
- CLI OTel cost data is available only from CLI sessions — IDE sessions do not emit cost

### Label Notes
- The OTel Collector Prometheus exporter maps the `service.name` resource attribute to the `job` label (not `service_name`). CLI metrics use `job="github-copilot"`, IDE metrics use `job="copilot-chat"`. Dashboard queries that need to filter by service use the `job` label accordingly.

---

## 6. Plug-and-Play: Using Real Data

This demo is designed for plug-and-play with real data:

1. **Real Usage Metrics API** → Replace `generate_sample_data.py` output with actual NDJSON downloads from `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest`. The push scripts consume the same field structure.

2. **Real IDE OTel** → Point VS Code's `github.copilot.chat.otel.otlpEndpoint` to this stack's OTel Collector (`http://localhost:4318`). The collector, Prometheus, and Grafana queries expect the same GenAI semconv attribute names.

3. **Real CLI OTel** → Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` when running `copilot`. The CLI emits the same span tree and metric names documented above.

The seeded data matches official response/signal shapes so that switching from seed → real requires only changing the data source, not the pipeline or dashboards.
