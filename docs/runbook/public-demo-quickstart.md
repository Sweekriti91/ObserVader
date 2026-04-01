# Endpoint Realism Reference

This document details how the demo's seeded data maps to real GitHub Copilot and OpenTelemetry endpoint families.
For quick-start steps, see the [root README](../../README.md#quick-start).

## Endpoint Families (with official sources)

This public demo uses real endpoint patterns and metric families, but in seeded/sample mode by default.

### GitHub Copilot Metrics APIs (official docs)
- REST index for Copilot APIs: https://docs.github.com/en/rest/copilot
- Copilot Usage Metrics API: https://docs.github.com/en/rest/copilot/copilot-usage-metrics
- Copilot Metrics concepts/fields: https://docs.github.com/en/copilot/concepts/copilot-usage-metrics/copilot-metrics

Representative documented endpoints:
- `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest`
- `GET /enterprises/{enterprise}/copilot/metrics/reports/users-1-day?day=YYYY-MM-DD`
- `GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest`
- Legacy metrics family: `GET /enterprises/{enterprise}/copilot/metrics`, `GET /orgs/{org}/copilot/metrics`

### OpenTelemetry OTLP HTTP (official docs)
- OTLP exporter configuration: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/
- OTLP specification: https://opentelemetry.io/docs/specs/otlp/
- OTel protocol exporter details: https://opentelemetry.io/docs/specs/otel/protocol/exporter/
- OTel GenAI Semantic Conventions: https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/

Documented signal endpoints used by this demo:
- `POST /v1/traces`
- `POST /v1/metrics`

### Copilot CLI OpenTelemetry (official docs)
- CLI command reference § OpenTelemetry monitoring: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring
- CLI OTel emits traces, metrics, and span events following OTel GenAI Semantic Conventions
- `service.name` defaults to `github-copilot` (distinct from IDE's `copilot-chat`)
- Includes unique signals: `github.copilot.cost`, `github.copilot.aiu`, cache token attributes, session shutdown events with LoC data

### Mandatory realism mapping table (official endpoint families -> seeded behavior)

| Official family | Representative endpoint pattern | Source | Public repo seeded behavior |
| --- | --- | --- | --- |
| GitHub Copilot Usage Metrics API | `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest` | GitHub REST Copilot Usage Metrics docs | Simulated via `demo/scripts/generate_sample_data.py` writing seeded NDJSON to `demo/sample-data/enterprise-28d.ndjson`; this is protocol-shape realism, not live enterprise API calls. |
| GitHub Copilot Usage Metrics API | `GET /enterprises/{enterprise}/copilot/metrics/reports/users-1-day?day=YYYY-MM-DD` | GitHub REST Copilot Usage Metrics docs | Daily usage-like records are generated deterministically in seeded data; dashboards consume seeded metrics for repeatable demo outputs. |
| GitHub Copilot Usage Metrics API (org scope) | `GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest` | GitHub REST Copilot Usage Metrics docs | Public demo mirrors org/enterprise trend concepts with sample files and dashboard queries, without requiring customer org credentials. |
| OTLP HTTP traces | `POST /v1/traces` | OpenTelemetry OTLP spec | `demo/seed-data.ts` posts seeded spans to `${ENDPOINT}/v1/traces`; `ENDPOINT` defaults to `http://localhost:4318`; collector receives on `0.0.0.0:4318`. |
| OTLP HTTP metrics | `POST /v1/metrics` | OpenTelemetry OTLP spec | `demo/seed-data.ts` posts seeded metrics to `${ENDPOINT}/v1/metrics`; collector exports to Prometheus on `:8889`; Prometheus is configured to scrape collector metrics. |
| Copilot CLI Usage Metrics API | `copilot_cli` section in NDJSON | GitHub REST Copilot Usage Metrics docs | `demo/scripts/generate_sample_data.py` generates `copilot_cli` fields (`total_cli_sessions`, `total_cli_requests`, `total_cli_prompts`, `total_cli_tokens_sent/received`) in each daily NDJSON record. Fields follow `totals_by_cli` schema from the API. |
| Copilot CLI OTel traces | `POST /v1/traces` | [CLI command reference § OTel](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring) | Planned: `demo/seed-cli-data.ts` will post CLI-shaped spans (`invoke_agent`, `chat`, `execute_tool`) with `service.name: github-copilot`, `github.copilot.cost`, `github.copilot.aiu`, and cache token attributes. |
| Copilot CLI OTel metrics | `POST /v1/metrics` | [CLI command reference § OTel](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring) | Planned: `demo/seed-cli-data.ts` will post CLI OTel metrics (`gen_ai.client.operation.duration`, `gen_ai.client.token.usage`, `github.copilot.tool.call.count/duration`, `github.copilot.agent.turn.count`) with `service.name: github-copilot`. |
| Copilot CLI OTel span events | Recorded on `invoke_agent`/`chat` spans | [CLI command reference § OTel](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring) | Planned: `demo/seed-cli-data.ts` will emit `session.shutdown` (with `lines_added`, `lines_removed`, `files_modified_count`, `total_premium_requests`), `session.truncation`, `session.compaction_*`, and `skill.invoked` events. |
| OTel GenAI Semantic Conventions | Attribute schema for all OTel signals | [OTel GenAI semconv](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/) | Both `seed-data.ts` (IDE) and planned `seed-cli-data.ts` (CLI) use GenAI convention attribute names (`gen_ai.*`). This is the schema authority for all OTel signal shapes in this demo. |

### Real protocol shape vs seeded simulation
- **Real protocol shape:** OTLP HTTP endpoints, payload families, and telemetry pipeline shape match documented patterns.
- **Seeded simulation:** Copilot usage metrics are generated from deterministic sample scripts and files in this public repo.
- **Intentional non-goal:** no live enterprise/customer adapters, tokens, or customer endpoints in defaults.

## Public Release Checks
- No customer names in docs/scripts
- No enterprise tokens/endpoints in defaults
- Dashboard renders from sample + seeded telemetry
- Fork-only hosting guidance stays optional; upstream public repo remains local-demo-first
