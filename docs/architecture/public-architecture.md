# Public Architecture Summary

- Public architecture is intentionally local-demo-first and seeded-data-first.
- Usage metrics are represented by seeded NDJSON generation in `demo/sample-data`.
- OTel telemetry is seeded to OTLP HTTP and flows through OTel Collector into Prometheus and Jaeger.
- Grafana provides two dashboards:
  1. **Copilot Metrics — Unified Dashboard**: adoption, code impact, PR/CCR, and agent observability
  2. **Copilot ROI & Cost Efficiency**: cost, cache efficiency, and productivity impact (CLI OTel data)
- Jaeger provides trace drill-down for seeded agent interactions.
- Live enterprise/customer adapters and secret-backed integrations are intentionally excluded from this public repo.

## Data Flow

```mermaid
flowchart LR
    subgraph Sources
        NDJSON["NDJSON Seed Data<br/><i>enterprise-28d.ndjson</i>"]
        OTelSeed["OTel Seed Scripts<br/><i>seed-data.ts / seed-cli-data.ts</i>"]
    end

    subgraph Ingestion
        PGW["Pushgateway<br/>:9091"]
        OTEL["OTel Collector<br/>:4318 OTLP HTTP"]
    end

    subgraph Storage
        PROM["Prometheus<br/>:9090"]
        JAEGER["Jaeger<br/>:16686"]
    end

    subgraph Visualization
        GrafanaUD["Grafana — Unified Dashboard<br/><i>Adoption · Code Impact · PR/CCR · Agent Obs</i>"]
        GrafanaROI["Grafana — ROI & Cost Efficiency<br/><i>Cost · Cache · Productivity (CLI OTel)</i>"]
    end

    NDJSON -- "push_usage_metrics.py<br/>push_pr_metrics.py" --> PGW
    OTelSeed -- "traces + metrics<br/>OTLP HTTP" --> OTEL

    PGW -- "scrape" --> PROM
    OTEL -- "remote write /<br/>prometheus exporter" --> PROM
    OTEL -- "otlphttp export" --> JAEGER

    PROM --> GrafanaUD
    PROM --> GrafanaROI
    JAEGER -- "trace drill-down" --> GrafanaUD
```
