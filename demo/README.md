# Copilot Metrics Demo (Public)

Public, reusable demo for combining GitHub Copilot usage metrics with OpenTelemetry observability.

## Quick Start (sample-first)

```bash
cd demo
docker compose up -d
python3 scripts/generate_sample_data.py
npx tsx seed-data.ts
```

Then open:
- Grafana: http://localhost:3001
- Jaeger: http://localhost:16686
- Prometheus: http://localhost:9090

> This public version is intentionally sample/seeded-data first.
> Live enterprise adapters belong in private customer forks.
