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

Documented signal endpoints used by this demo:
- `POST /v1/traces`
- `POST /v1/metrics`

### Mandatory realism mapping table (official endpoint families -> seeded behavior)

| Official family | Representative endpoint pattern | Source | Public repo seeded behavior |
| --- | --- | --- | --- |
| GitHub Copilot Usage Metrics API | `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest` | GitHub REST Copilot Usage Metrics docs | Simulated via `demo/scripts/generate_sample_data.py` writing seeded NDJSON to `demo/sample-data/enterprise-28d.ndjson`; this is protocol-shape realism, not live enterprise API calls. |
| GitHub Copilot Usage Metrics API | `GET /enterprises/{enterprise}/copilot/metrics/reports/users-1-day?day=YYYY-MM-DD` | GitHub REST Copilot Usage Metrics docs | Daily usage-like records are generated deterministically in seeded data; dashboards consume seeded metrics for repeatable demo outputs. |
| GitHub Copilot Usage Metrics API (org scope) | `GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest` | GitHub REST Copilot Usage Metrics docs | Public demo mirrors org/enterprise trend concepts with sample files and dashboard queries, without requiring customer org credentials. |
| OTLP HTTP traces | `POST /v1/traces` | OpenTelemetry OTLP spec | `demo/seed-data.ts` posts seeded spans to `${ENDPOINT}/v1/traces`; `ENDPOINT` defaults to `http://localhost:4318`; collector receives on `0.0.0.0:4318`. |
| OTLP HTTP metrics | `POST /v1/metrics` | OpenTelemetry OTLP spec | `demo/seed-data.ts` posts seeded metrics to `${ENDPOINT}/v1/metrics`; collector exports to Prometheus on `:8889`; Prometheus is configured to scrape collector metrics. |

### Real protocol shape vs seeded simulation
- **Real protocol shape:** OTLP HTTP endpoints, payload families, and telemetry pipeline shape match documented patterns.
- **Seeded simulation:** Copilot usage metrics are generated from deterministic sample scripts and files in this public repo.
- **Intentional non-goal:** no live enterprise/customer adapters, tokens, or customer endpoints in defaults.

## Public Release Checks
- No customer names in docs/scripts
- No enterprise tokens/endpoints in defaults
- Dashboard renders from sample + seeded telemetry
- Fork-only hosting guidance stays optional; upstream public repo remains local-demo-first
