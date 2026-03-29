#!/bin/bash
set -e

STACK=$1
if [ -z "$STACK" ]; then
  echo "Usage: deploy.sh <dev|prod>"
  exit 1
fi

# Load .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

WORKER_NAME="arena-api-$STACK"
PAGES_PROJECT="arena-web-$STACK"
export VITE_API_URL="https://$WORKER_NAME.$CLOUDFLARE_ACCOUNT_ID.workers.dev"

echo "→ Building (VITE_API_URL=$VITE_API_URL)"
pnpm turbo run build --force

echo "→ Deploying infra (stack: $STACK)"
pnpm --filter infra exec pulumi up --stack "$STACK" --yes

echo "→ Deploying web assets"
pnpm --filter @arena/web exec wrangler pages deploy dist --project-name "$PAGES_PROJECT"
