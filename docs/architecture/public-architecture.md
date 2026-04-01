# Public Architecture Summary

- Public architecture is intentionally local-demo-first and seeded-data-first.
- Usage metrics are represented by seeded NDJSON generation in `demo/sample-data`.
- OTel telemetry is seeded to OTLP HTTP and flows through OTel Collector into Prometheus and Jaeger.
- Grafana provides unified visualization for adoption, code impact, PR/CCR, and agent observability.
- Jaeger provides trace drill-down for seeded agent interactions.
- Live enterprise/customer adapters and secret-backed integrations are intentionally excluded from this public repo.
