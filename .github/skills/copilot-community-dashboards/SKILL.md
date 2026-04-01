---
name: copilot-community-dashboards
description: >
  Community-built and Microsoft-published dashboard solutions for visualizing GitHub Copilot
  metrics. Covers Power BI, Grafana, Streamlit, React, and MCP-based dashboards with setup guidance.
tags: [copilot, dashboard, community, power-bi, grafana, streamlit, visualization]
---

# Community & Open-Source Copilot Metrics Dashboards

## Official / Microsoft Solutions

### 1. microsoft/copilot-metrics-dashboard ⭐ 185

**TypeScript solution accelerator** for visualizing Copilot metrics.

- **Tech**: TypeScript
- **Data sources**: Copilot Metrics API + User Management API
- **Repo**: https://github.com/microsoft/copilot-metrics-dashboard
- **Best for**: Teams wanting a ready-made, comprehensive dashboard

### 2. github-copilot-resources/copilot-metrics-viewer-power-bi ⭐ 83

**Power BI dashboard template** leveraging the Copilot Metrics API.

- **Tech**: Power BI
- **Repo**: https://github.com/github-copilot-resources/copilot-metrics-viewer-power-bi
- **Best for**: Organizations already using Power BI for reporting

---

## Community Solutions

### 3. satomic/copilot-usage-advanced-dashboard ⭐ 74

**Advanced Grafana dashboard** with persistent data storage and multi-organization support.

- **Tech**: Python backend + Grafana
- **Features**: Multi-org support, historical data persistence, advanced visualizations
- **Repo**: https://github.com/satomic/copilot-usage-advanced-dashboard
- **Best for**: Teams wanting Grafana-based monitoring with data retention

### 4. thomast1906/github-copilot-usage-metrics-viewer ⭐ 19

**Interactive dashboard** for visualizing GitHub Premium requests usage metrics.

- **Tech**: JavaScript
- **Repo**: https://github.com/thomast1906/github-copilot-usage-metrics-viewer
- **Best for**: Quick, lightweight metrics visualization

### 5. samueltauil/copilot-compass ⭐ 18

**MCP App** for navigating Copilot usage metrics with interactive dashboards.

- **Tech**: TypeScript
- **Repo**: https://github.com/samueltauil/copilot-compass
- **Best for**: Teams interested in MCP-based tooling

### 6. satomic/copilot-metrics-4-every-user ⭐ 15

**Proxy-based** Copilot metrics tracking with per-user data and Grafana visualization.

- **Tech**: Python + mitmproxy + Grafana
- **Repo**: https://github.com/satomic/copilot-metrics-4-every-user
- **Best for**: Teams wanting individual user-level tracking via proxy

### 7. Avanade/ghcp-usage-dashboard ⭐ 8

**Streamlit + Azure OpenAI** analytics for Copilot usage trends.

- **Tech**: Python + Streamlit
- **Repo**: https://github.com/Avanade/ghcp-usage-dashboard
- **Best for**: Azure-oriented teams wanting AI-powered analytics

### 8. ambilykk/copilot-dashboard ⭐ 8

**Repository template** for visualizing metrics related to Copilot usage and seat assignments.

- **Tech**: TypeScript
- **Repo**: https://github.com/ambilykk/copilot-dashboard
- **Best for**: Quick-start template for building custom dashboards

---

## Building Your Own Dashboard

### Recommended Architecture

1. **Data Source**: Use the Copilot Usage Metrics API (v2026-03-10) for data
2. **Data Pipeline**: Download NDJSON reports → parse → store in your preferred database
3. **Visualization**: Choose based on your stack:
   - **Grafana** — best for time-series metrics and alerting
   - **Power BI** — best for enterprise BI and executive reporting
   - **Streamlit** — best for quick Python-based prototyping
   - **React + chart libraries** (Nivo, Chart.js, Recharts) — best for custom web dashboards
   - **Jupyter Notebooks** — best for ad-hoc analysis

### Data Pipeline Example

```bash
#!/bin/bash
# Fetch and store daily Copilot metrics

DATE=$(date -u -d "2 days ago" +%Y-%m-%d)
TOKEN="ghp_xxx"
ENTERPRISE="my-enterprise"

# Get download links
LINKS=$(curl -s -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/enterprises/$ENTERPRISE/copilot/metrics/reports/enterprise-1-day?day=$DATE" \
  | jq -r '.download_links[]')

# Download and store each report file
for link in $LINKS; do
  curl -s -L "$link" >> "metrics-${DATE}.ndjson"
done

echo "Downloaded metrics for $DATE"
```

### Key Metrics to Visualize

| Category | Metrics | Chart Type |
|----------|---------|-----------|
| Adoption | DAU, WAU, total active users | Line chart (trend) |
| Engagement | user_initiated_interaction_count per user | Bar chart |
| Acceptance | code_acceptance / code_generation ratio | Line chart (trend) |
| Code Output | loc_added_sum, loc_deleted_sum | Stacked area chart |
| Feature Mix | Requests per chat mode | Pie/donut chart |
| Agent Adoption | % users with used_agent=true | Line chart (trend) |
| CLI Usage | daily_active_cli_users | Line chart |
| PR Impact | median_minutes_to_merge | Line chart (trend) |

### For Real-Time Agent Monitoring
Use **OpenTelemetry** rather than the Metrics API:
- OTel provides per-request traces, tool execution timing, and token usage
- See the `copilot-opentelemetry` skill for backend setup instructions
