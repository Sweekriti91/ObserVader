#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧹 Tearing down Copilot Metrics Demo stack..."
docker compose down --remove-orphans
echo "✅ Done"
