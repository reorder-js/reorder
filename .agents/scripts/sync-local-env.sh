#!/usr/bin/env bash
set -e

echo "=== Medusa Reorder Local Dev Environment Sync ==="

# Free up ports 9000 & 8000 and terminate any stale watchers
echo ">> 0/4: Cleaning up existing local dev processes on ports 9000 and 8000..."
lsof -ti :8000 -ti :9000 | xargs kill -9 2>/dev/null || true
pkill -9 -f "medusajs/cli" 2>/dev/null || true

# 1. Verify source directory
if [ ! -f "package.json" ] || ! grep -q "\"name\": \"@reorderjs/reorder\"" "package.json"; then
  echo "Error: This script must be run from the root of the 'reorder' repository."
  exit 1
fi

REORDER_ROOT="$(pwd)"

echo ">> 1/4: Building reorder plugin..."
yarn build

echo ">> 2/4: Pushing plugin locally to yalc registry..."
npx yalc push

# 2. Find Medusa backend directory
BACKEND_DIR=""
echo ">> 3/4: Searching for Medusa backend directory..."
for dir in ../*/; do
  if [ -f "${dir}medusa-config.ts" ] && [ -f "${dir}package.json" ]; then
    if grep -q "@reorderjs/reorder" "${dir}package.json"; then
      BACKEND_DIR="$(cd "${dir}" && pwd)"
      break
    fi
  fi
done

if [ -z "$BACKEND_DIR" ]; then
  echo "Error: Could not find a Medusa backend project with @reorderjs/reorder installed adjacent to this directory."
  exit 1
fi
echo ">> Found backend at: $BACKEND_DIR"

# 3. Find Storefront directory
STOREFRONT_DIR=""
echo ">> 4/4: Searching for Storefront directory..."
if [ -d "../subscription-storefront" ] && [ -f "../subscription-storefront/package.json" ]; then
  STOREFRONT_DIR="$(cd "../subscription-storefront" && pwd)"
else
  for dir in ../*/; do
    if [ -f "${dir}package.json" ] && { [ -f "${dir}next.config.js" ] || [ -f "${dir}next.config.mjs" ] || [ -f "${dir}next.config.ts" ]; }; then
      if [ "$(cd "$dir" && pwd)" != "$BACKEND_DIR" ]; then
        STOREFRONT_DIR="$(cd "${dir}" && pwd)"
        break
      fi
    fi
  done
fi

if [ -z "$STOREFRONT_DIR" ]; then
  echo "Warning: Could not auto-detect Storefront directory adjacent to reorder."
else
  echo ">> Found storefront at: $STOREFRONT_DIR"
fi

# 4. Prepare backend: check DB & run migrations
echo ">> Preparing Medusa backend..."
cd "$BACKEND_DIR"
if [ -f ".env" ]; then
  DB_URL=$(grep '^DATABASE_URL=' .env | cut -d '=' -f2-)
  if [ -n "$DB_URL" ]; then
    echo "   Database configured at: $DB_URL"
  else
    echo "   Warning: DATABASE_URL is missing in backend .env!"
  fi
else
  echo "   Warning: .env file is missing in backend directory!"
fi

yarn install
yarn medusa db:migrate

# 5. Prepare storefront (if found)
if [ -n "$STOREFRONT_DIR" ]; then
  echo ">> Preparing Storefront..."
  
  # Fetch active publishable API key from Medusa DB if psql and DB_URL are available
  DB_PUB_KEY=""
  if [ -n "$DB_URL" ] && command -v psql >/dev/null 2>&1; then
    DB_PUB_KEY=$(psql "$DB_URL" -t -A -c "SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;" 2>/dev/null || true)
  fi

  cd "$STOREFRONT_DIR"
  TARGET_ENV_FILE=""
  if [ -f ".env.local" ]; then
    TARGET_ENV_FILE=".env.local"
  elif [ -f ".env" ]; then
    TARGET_ENV_FILE=".env"
  fi

  if [ -n "$TARGET_ENV_FILE" ]; then
    CURRENT_PUB_KEY=$(grep '^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=' "$TARGET_ENV_FILE" | cut -d '=' -f2-)
    
    if [ -n "$DB_PUB_KEY" ] && [ "$DB_PUB_KEY" != "$CURRENT_PUB_KEY" ]; then
      echo "   ⚡ Detected new publishable API key in database: $DB_PUB_KEY (was: $CURRENT_PUB_KEY)"
      echo "   Updating $TARGET_ENV_FILE with new key..."
      if grep -q '^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=' "$TARGET_ENV_FILE"; then
        # Replace existing key in file
        sed -i '' "s/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=.*/NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$DB_PUB_KEY/" "$TARGET_ENV_FILE"
      else
        echo "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$DB_PUB_KEY" >> "$TARGET_ENV_FILE"
      fi
      PUB_KEY="$DB_PUB_KEY"
    else
      PUB_KEY="$CURRENT_PUB_KEY"
    fi

    if [ -n "$PUB_KEY" ]; then
      echo "   Storefront publishable key: $PUB_KEY"
    else
      echo "   Warning: NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is missing in storefront $TARGET_ENV_FILE!"
    fi
  else
    echo "   Warning: No .env.local or .env found in storefront directory!"
  fi
  yarn install
fi

echo ""
echo "=== Environment Sync Complete ==="
echo "BACKEND_DIR=$BACKEND_DIR"
echo "STOREFRONT_DIR=$STOREFRONT_DIR"
