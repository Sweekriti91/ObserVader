---
name: copilot-cli-metrics
description: >
  Copilot CLI-specific metrics — what's tracked, where to find the data, and how CLI metrics
  relate to (and are independent of) IDE metrics. Includes field reference, API access examples,
  analysis patterns, and CLI OpenTelemetry signal reference.
tags: [copilot, cli, metrics, api, sessions, tokens, opentelemetry, otel, traces]
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

---

## CLI OpenTelemetry (OTel) Monitoring

**Source**: [CLI command reference § OpenTelemetry monitoring](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring)

Copilot CLI can export traces and metrics via OpenTelemetry, giving visibility into agent interactions,
LLM calls, tool executions, and token usage. All signal names and attributes follow the
[OTel GenAI Semantic Conventions](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/).

OTel is **off by default** with zero overhead. It activates when any of the following are set:
- `COPILOT_OTEL_ENABLED=true`
- `OTEL_EXPORTER_OTLP_ENDPOINT` is set
- `COPILOT_OTEL_FILE_EXPORTER_PATH` is set

### CLI OTel Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COPILOT_OTEL_ENABLED` | `false` | Explicitly enable OTel. Not required if `OTEL_EXPORTER_OTLP_ENDPOINT` is set. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTLP endpoint URL. Setting this automatically enables OTel. |
| `COPILOT_OTEL_EXPORTER_TYPE` | `otlp-http` | Exporter type: `otlp-http` or `file`. Auto-selects `file` when `COPILOT_OTEL_FILE_EXPORTER_PATH` is set. |
| `OTEL_SERVICE_NAME` | `github-copilot` | Service name in resource attributes. |
| `OTEL_RESOURCE_ATTRIBUTES` | — | Extra resource attributes as comma-separated `key=value` pairs. Use percent-encoding for special characters. |
| `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` | `false` | Capture full prompt and response content. |
| `OTEL_LOG_LEVEL` | — | OTel diagnostic log level: `NONE`, `ERROR`, `WARN`, `INFO`, `DEBUG`, `VERBOSE`, `ALL`. |
| `COPILOT_OTEL_FILE_EXPORTER_PATH` | — | Write all signals to this file as JSON-lines. Setting this automatically enables OTel. |
| `COPILOT_OTEL_SOURCE_NAME` | `github.copilot` | Instrumentation scope name for tracer and meter. |
| `OTEL_EXPORTER_OTLP_HEADERS` | — | Auth headers for the OTLP exporter (e.g., `Authorization=Bearer token`). |

### CLI OTel Resource Attributes

All CLI OTel signals carry these resource attributes:

| Attribute | Value |
|-----------|-------|
| `service.name` | `github-copilot` (configurable via `OTEL_SERVICE_NAME`) |
| `service.version` | Runtime version |

**Key distinction**: CLI uses `service.name: github-copilot` by default, while VS Code IDE uses `service.name: copilot-chat`. This enables filtering by surface in Prometheus/Grafana.

### CLI OTel Traces

The CLI emits a hierarchical span tree for each agent interaction:

```
invoke_agent copilot                          [CLIENT]
  ├── chat claude-sonnet-4.6                  [CLIENT]  (LLM request)
  ├── execute_tool readFile                   [INTERNAL] (tool call)
  ├── execute_tool bash                       [INTERNAL] (tool call)
  ├── chat claude-sonnet-4.6                  [CLIENT]  (next turn)
  └── ...
```

#### `invoke_agent` Span Attributes

Wraps the entire agent invocation: all LLM calls and tool executions for one user message. Span kind: `CLIENT`.

| Attribute | Description |
|-----------|-------------|
| `gen_ai.operation.name` | `invoke_agent` |
| `gen_ai.provider.name` | Provider (e.g., `github`, `anthropic`) |
| `gen_ai.agent.id` | Session identifier |
| `gen_ai.agent.name` | Agent name (subagents only) |
| `gen_ai.agent.description` | Agent description (subagents only) |
| `gen_ai.agent.version` | Runtime version |
| `gen_ai.conversation.id` | Session identifier |
| `gen_ai.request.model` | Requested model |
| `gen_ai.response.model` | Resolved model |
| `gen_ai.response.id` | Last response ID |
| `gen_ai.response.finish_reasons` | `["stop"]` or `["error"]` |
| `gen_ai.usage.input_tokens` | Total input tokens (all turns) |
| `gen_ai.usage.output_tokens` | Total output tokens (all turns) |
| `gen_ai.usage.cache_read.input_tokens` | Cached input tokens read |
| `gen_ai.usage.cache_creation.input_tokens` | Cached input tokens created |
| `github.copilot.turn_count` | Number of LLM round-trips |
| `github.copilot.cost` | **Monetary cost** |
| `github.copilot.aiu` | **AI units consumed** |
| `server.address` | Server hostname |
| `server.port` | Server port |
| `error.type` | Error class name (on error) |
| `gen_ai.input.messages` | Full input messages as JSON (content capture only) |
| `gen_ai.output.messages` | Full output messages as JSON (content capture only) |
| `gen_ai.system_instructions` | System prompt content as JSON (content capture only) |
| `gen_ai.tool.definitions` | Tool schemas as JSON (content capture only) |

#### `chat` Span Attributes

One span per LLM request. Span kind: `CLIENT`.

| Attribute | Description |
|-----------|-------------|
| `gen_ai.operation.name` | `chat` |
| `gen_ai.provider.name` | Provider name |
| `gen_ai.request.model` | Requested model |
| `gen_ai.conversation.id` | Session identifier |
| `gen_ai.response.id` | Response ID |
| `gen_ai.response.model` | Resolved model |
| `gen_ai.response.finish_reasons` | Stop reasons |
| `gen_ai.usage.input_tokens` | Input tokens this turn |
| `gen_ai.usage.output_tokens` | Output tokens this turn |
| `gen_ai.usage.cache_read.input_tokens` | Cached tokens read |
| `gen_ai.usage.cache_creation.input_tokens` | Cached tokens created |
| `github.copilot.cost` | Turn cost |
| `github.copilot.aiu` | AI units consumed this turn |
| `github.copilot.server_duration` | Server-side duration |
| `github.copilot.initiator` | Request initiator |
| `github.copilot.turn_id` | Turn identifier |
| `github.copilot.interaction_id` | Interaction identifier |
| `server.address` | Server hostname |
| `server.port` | Server port |
| `error.type` | Error class name (on error) |
| `gen_ai.input.messages` | Full prompt messages as JSON (content capture only) |
| `gen_ai.output.messages` | Full response messages as JSON (content capture only) |
| `gen_ai.system_instructions` | System prompt content as JSON (content capture only) |

#### `execute_tool` Span Attributes

One span per tool call. Span kind: `INTERNAL`.

| Attribute | Description |
|-----------|-------------|
| `gen_ai.operation.name` | `execute_tool` |
| `gen_ai.provider.name` | Provider name (when available) |
| `gen_ai.tool.name` | Tool name (e.g., `readFile`, `bash`, `edit`, `glob`, `grep`) |
| `gen_ai.tool.type` | `function` |
| `gen_ai.tool.call.id` | Tool call identifier |
| `gen_ai.tool.description` | Tool description |
| `error.type` | Error class name (on error) |
| `gen_ai.tool.call.arguments` | Tool input arguments as JSON (content capture only) |
| `gen_ai.tool.call.result` | Tool output as JSON (content capture only) |

**CLI-specific tool names**: `bash`, `view`, `edit`, `create`, `glob`, `grep`, `web_fetch`, `task`, `read_agent`, `list_agents`, `skill`, `ask_user`, `apply_patch`

### CLI OTel Metrics

#### GenAI Convention Metrics

| Metric | Type | Unit | Description |
|--------|------|------|-------------|
| `gen_ai.client.operation.duration` | Histogram | s | LLM API call and agent invocation duration |
| `gen_ai.client.token.usage` | Histogram | tokens | Token counts by type (`input`/`output`) |
| `gen_ai.client.operation.time_to_first_chunk` | Histogram | s | Time to receive first streaming chunk |
| `gen_ai.client.operation.time_per_output_chunk` | Histogram | s | Inter-chunk latency after first chunk |

#### Vendor-Specific Metrics

| Metric | Type | Unit | Description |
|--------|------|------|-------------|
| `github.copilot.tool.call.count` | Counter | calls | Tool invocations by `gen_ai.tool.name` and success |
| `github.copilot.tool.call.duration` | Histogram | s | Tool execution latency by `gen_ai.tool.name` |
| `github.copilot.agent.turn.count` | Histogram | turns | LLM round-trips per agent invocation |

### CLI OTel Span Events

Lifecycle events recorded on the active `chat` or `invoke_agent` span.

| Event Name | Description | Key Attributes |
|------------|-------------|----------------|
| `github.copilot.hook.start` | A hook began executing | `hook.type`, `hook.invocation_id` |
| `github.copilot.hook.end` | A hook completed successfully | `hook.type`, `hook.invocation_id` |
| `github.copilot.hook.error` | A hook failed | `hook.type`, `hook.invocation_id`, `hook.error_message` |
| `github.copilot.session.truncation` | Conversation history was truncated | `token_limit`, `pre_tokens`, `post_tokens`, `tokens_removed`, `messages_removed` |
| `github.copilot.session.compaction_start` | History compaction began | — |
| `github.copilot.session.compaction_complete` | History compaction completed | `success`, `pre_tokens`, `post_tokens`, `tokens_removed`, `messages_removed` |
| `github.copilot.skill.invoked` | A skill was invoked | `skill.name`, `skill.path`, `skill.plugin_name`, `skill.plugin_version` |
| `github.copilot.session.shutdown` | Session is shutting down | `shutdown_type`, **`total_premium_requests`**, **`lines_added`**, **`lines_removed`**, **`files_modified_count`** |
| `github.copilot.session.abort` | User cancelled the current operation | `abort_reason` |
| `exception` | Session error | `error_type`, `error_status_code`, `error_provider_call_id` |

### CLI OTel Content Capture

By default, no prompt content, responses, or tool arguments are captured — only metadata (model names, token counts, durations). To capture full content, set `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`.

When content capture is enabled, these attributes are populated:

| Attribute | Description |
|-----------|-------------|
| `gen_ai.input.messages` | Full prompt messages (JSON) |
| `gen_ai.output.messages` | Full response messages (JSON) |
| `gen_ai.system_instructions` | System prompt content (JSON) |
| `gen_ai.tool.definitions` | Tool schemas (JSON) |
| `gen_ai.tool.call.arguments` | Tool input arguments |
| `gen_ai.tool.call.result` | Tool output |

> **Warning**: Content capture may include sensitive information such as code, file contents, and user prompts. Only enable this in trusted environments.

### Key Signals Unique to CLI OTel (Not Available Elsewhere)

These signals are available **only** through CLI OTel — not in the Usage Metrics API or IDE OTel:

| Signal | Where It Appears | Why It Matters |
|--------|------------------|----------------|
| `github.copilot.cost` | `invoke_agent` + `chat` span attributes | Variable monetary cost per interaction — enables cost-per-session, cost-per-turn analysis |
| `github.copilot.aiu` | `invoke_agent` + `chat` span attributes | AI Units consumed — ties to premium request billing |
| `gen_ai.usage.cache_read.input_tokens` | `invoke_agent` + `chat` span attributes | Cache efficiency tracking |
| `gen_ai.usage.cache_creation.input_tokens` | `invoke_agent` + `chat` span attributes | Cache creation cost |
| `session.shutdown` → `lines_added` / `lines_removed` | Span event on session end | Per-session LoC impact from CLI |
| `session.shutdown` → `total_premium_requests` | Span event on session end | Premium request consumption per session |
| `session.shutdown` → `files_modified_count` | Span event on session end | Blast radius per session |
| `session.truncation` / `session.compaction_*` | Span events | Context window pressure indicators |
| `gen_ai.client.operation.time_per_output_chunk` | Metric | Streaming quality — inter-chunk latency |
| `github.copilot.skill.invoked` | Span event | Skill usage tracking in CLI sessions |

### CLI OTel vs IDE OTel: Key Differences

| Aspect | CLI OTel | IDE OTel (VS Code) |
|--------|----------|-------------------|
| `service.name` default | `github-copilot` | `copilot-chat` |
| Cost attribute | `github.copilot.cost` on spans | Not emitted |
| AI Units attribute | `github.copilot.aiu` on spans | Not emitted |
| Cache token attributes | On `invoke_agent` + `chat` spans | Not emitted |
| Session shutdown event | Lines added/removed, files modified, premium requests | Not emitted |
| Tool names | `bash`, `view`, `edit`, `create`, `glob`, `grep`, `task` | `readFile`, `editFile`, `searchFiles`, `runCommand` |
| Context management events | Truncation + compaction events | Not emitted |
| Streaming metrics | `time_to_first_chunk` + `time_per_output_chunk` | `time_to_first_token` only |
| Exporter types | `otlp-http`, `file` | `otlp-http`, `otlp-grpc`, `console`, `file` |
| Configuration | Environment variables only | VS Code settings + environment variables |
