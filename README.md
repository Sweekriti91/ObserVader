# ObserVader

A practical GitHub Copilot observability demo that combines usage metrics with OpenTelemetry signals.

> This is a seeded reference demo for local reproducibility — not a production deployment target.
> Live enterprise adapters and secret-backed integrations belong in private forks.

## What it does

ObserVader provides a runnable local stack for:
- **Usage & adoption metrics** — visualize Copilot completions, chat, PR summaries, and seat activity
- **Agent observability** — trace latency, token usage, and tool activity via OpenTelemetry
- **Dashboard-driven gap analysis** — identify adoption gaps across teams and editors

## Dashboard Screenshots

![Grafana Dashboard 1](docs/screenshots/Grafana1.jpg)
![Grafana Dashboard 2](docs/screenshots/Grafana2.jpg)
![Grafana Dashboard 3](docs/screenshots/Grafana3.jpg)
![Grafana Dashboard 4](docs/screenshots/Grafana4.jpg)
![Grafana Dashboard 5](docs/screenshots/Grafana5.jpg)

## Architecture

| Component | Role |
| --- | --- |
| **Grafana** | Unified dashboard visualization |
| **Prometheus** | Metrics query and storage |
| **OTel Collector** | Telemetry intake and export (OTLP HTTP) |
| **Jaeger** | Distributed trace exploration |
| **Seeded data** | Deterministic sample data for repeatable demos |

## Quick Start

```bash
cd demo
docker compose up -d
python3 scripts/generate_sample_data.py
python3 scripts/push_pr_metrics.py
npx tsx seed-data.ts
```

Then open:
- Grafana: http://localhost:3001
- Jaeger: http://localhost:16686
- Prometheus: http://localhost:9090

For endpoint realism details and protocol-shape mapping, see [docs/runbook/public-demo-quickstart.md](docs/runbook/public-demo-quickstart.md).

## Repository Layout

```
demo/                  Runnable local stack, dashboards, and seed scripts
docs/architecture/     Architecture references
docs/runbook/          Endpoint realism and operating runbooks
docs/screenshots/      Dashboard screenshots
```

## Security and Scope

- Sample/seeded-data first — no live API calls, no customer identifiers in defaults
- Enterprise tokens, customer endpoints, and secret-backed adapters are excluded
- Public Azure hosting is intentionally deferred; optional guidance for fork maintainers only

## Credits

Inspired by [copilot-opentelemetry](https://github.com/pierceboggan/copilot-opentelemetry)

Inspired by practical Copilot observability workflows including:
https://github.com/pierceboggan/copilot-opentelemetry
