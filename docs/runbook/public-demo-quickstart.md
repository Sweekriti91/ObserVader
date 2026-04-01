# Public Demo Quickstart

## Goals
- Run fully offline/sample-first demo
- Avoid customer-specific identifiers or enterprise API defaults

## Steps
1. `cd demo`
2. `docker compose up -d`
3. `python3 scripts/generate_sample_data.py`
4. `npx tsx seed-data.ts`
5. Open Grafana at `http://localhost:3001`

## Public release checks
- No customer names in docs/scripts
- No enterprise tokens/endpoints in defaults
- Dashboard renders from sample + seeded telemetry
