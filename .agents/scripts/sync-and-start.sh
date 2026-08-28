#!/usr/bin/env bash
set -e

# Run synchronization and preparation
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/sync-local-env.sh"

# Locate directories
BACKEND_DIR=""
for dir in ../*/; do
  if [ -f "${dir}medusa-config.ts" ] && [ -f "${dir}package.json" ]; then
    if grep -q "@reorderjs/reorder" "${dir}package.json"; then
      BACKEND_DIR="$(cd "${dir}" && pwd)"
      break
    fi
  fi
done

STOREFRONT_DIR=""
if [ -d "../subscription-storefront" ] && [ -f "../subscription-storefront/package.json" ]; then
  STOREFRONT_DIR="$(cd "../subscription-storefront" && pwd)"
fi

echo ">> Starting dev servers..."
echo "=================================================="
echo "🚀 Medusa Backend API:     http://localhost:9000"
echo "🖥️  Medusa Admin Dashboard: http://localhost:9000/app"
if [ -n "$STOREFRONT_DIR" ]; then
  echo "🛍️  Storefront:             http://localhost:8000"
fi
echo "=================================================="

BACKEND_PID=""
STOREFRONT_PID=""

cleanup() {
  echo ""
  echo ">> Stopping dev servers..."
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "$STOREFRONT_PID" ]; then
    kill "$STOREFRONT_PID" 2>/dev/null || true
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

cd "$BACKEND_DIR"
yarn dev &
BACKEND_PID=$!

if [ -n "$STOREFRONT_DIR" ]; then
  # Wait for backend health before starting storefront
  until curl -s -f http://localhost:9000/health >/dev/null 2>&1; do
    sleep 1
  done
  cd "$STOREFRONT_DIR"
  yarn dev &
  STOREFRONT_PID=$!
fi

if [ -n "$STOREFRONT_PID" ]; then
  wait "$BACKEND_PID" "$STOREFRONT_PID"
else
  wait "$BACKEND_PID"
fi
