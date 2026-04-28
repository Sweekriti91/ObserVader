#!/usr/bin/env bash
# One-shot demo launcher with optional --fast flag for urgent demos.
#
# Usage:
#   ./demo-up.sh          # Full seeding (30 waves, ~90s)
#   ./demo-up.sh --fast   # Fast seeding (~5s) — fewer waves, shorter delays
#   ./demo-up.sh --skip   # Skip seeding entirely (data persisted from last run)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE=""
for arg in "$@"; do
  case "$arg" in
    --fast) MODE="fast" ;;
    --skip) MODE="skip" ;;
  esac
done

echo "🚀 Starting Copilot Metrics Demo stack..."
docker compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
for port in 4318 9091 9090; do
  for i in $(seq 1 30); do
    if curl -sf "http://localhost:$port" >/dev/null 2>&1 || curl -sf "http://localhost:$port/-/ready" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
done
echo "✅ Services ready"

if [ "$MODE" = "skip" ]; then
  echo "⏭️  Skipping data seeding (--skip). Using persisted data from previous run."
  echo ""
  echo "   📊 Grafana  → http://localhost:3001  (admin / demo)"
  echo "   🔍 Jaeger   → http://localhost:16686"
  echo "   📈 Prometheus → http://localhost:9090"
  exit 0
fi

SEED_FLAG=""
if [ "$MODE" = "fast" ]; then
  SEED_FLAG="--fast"
  echo "⚡ Fast mode — reduced waves and delays for quick demo"
fi

# Step 1: Generate NDJSON (fast, writes to disk — already cached if file exists)
echo ""
echo "📝 Generating sample NDJSON data..."
python3 scripts/generate_sample_data.py

# Step 2: Push usage metrics to Pushgateway
echo "📤 Pushing usage metrics to Pushgateway..."
python3 scripts/push_usage_metrics.py

# Step 3: Push PR metrics to Pushgateway
echo "📤 Pushing PR metrics to Pushgateway..."
python3 scripts/push_pr_metrics.py

# Step 4: Seed IDE OTel data
echo "📡 Seeding IDE OTel traces + metrics..."
npx tsx seed-data.ts $SEED_FLAG

# Step 5: Seed CLI OTel data
echo "📡 Seeding CLI OTel traces + metrics..."
npx tsx seed-cli-data.ts $SEED_FLAG

echo ""
echo "✅ Demo stack is ready!"
echo ""
echo "   📊 Grafana    → http://localhost:3001  (admin / demo)"
echo "   🔍 Jaeger     → http://localhost:16686"
echo "   📈 Prometheus → http://localhost:9090"
