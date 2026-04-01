# ObserVader

A practical GitHub Copilot observability demo that combines usage metrics with OpenTelemetry signals.

## What it is

ObserVader provides a runnable demo stack for:
- usage/adoption metrics visualization,
- agent observability (latency, tokens, tool activity),
- dashboard-driven gap analysis workflows.

## Architecture

- Grafana for visualization
- Prometheus for metrics query/storage
- OTel Collector for telemetry intake/export
- Jaeger for trace exploration
- Sample + seeded data paths for repeatable demos

## Quick Start (sample-first)

```bash
cd demo
docker compose up -d
python3 scripts/generate_sample_data.py
npx tsx seed-data.ts
```

Open:
- Grafana: http://localhost:3001
- Jaeger: http://localhost:16686
- Prometheus: http://localhost:9090

## Repository Layout

- `demo/` runnable local stack and dashboards
- `docs/architecture/` architecture references
- `docs/gap-framework/` reusable metrics gap framework
- `docs/runbook/` demo operating runbooks

## Security and Scope

This public repo is sample/seeded-data first.
Live enterprise/customer adapters are intentionally kept in private repos.

## Credits

Inspired by practical Copilot observability workflows including:
https://github.com/pierceboggan/copilot-opentelemetry
