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

WORKERS_SUBDOMAIN=$(curl -s \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['subdomain'])")

echo "→ Building"
pnpm turbo run build --force

echo "→ Deploying infra (stack: $STACK)"
pnpm --filter infra exec pulumi config set workersDevSubdomain "$WORKERS_SUBDOMAIN" --stack "$STACK"
pnpm --filter infra exec pulumi up --stack "$STACK" --yes

echo "→ Deploying worker"
pnpm --filter @arena/api exec wrangler deploy --env "$STACK"

echo "→ Setting worker secret"
AUTH_SECRET=$(cd infra && /opt/homebrew/bin/pulumi config get betterAuthSecret --stack "$STACK")
echo "$AUTH_SECRET" | pnpm --filter @arena/api exec wrangler secret put BETTER_AUTH_SECRET --env "$STACK"

echo "→ Deploying web assets"
pnpm --filter @arena/web exec wrangler pages deploy dist --project-name "$PAGES_PROJECT"
