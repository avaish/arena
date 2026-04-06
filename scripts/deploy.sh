#!/bin/bash
set -e

STACK=${1:?Usage: deploy.sh <dev|prod>}

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "→ Building"
pnpm turbo run build --force

echo "→ Deploying infra (stack: $STACK)"
pnpm --filter infra exec pulumi up --stack "$STACK" --yes

PAGES_PROJECT=$(pnpm --filter infra exec pulumi stack output pagesProjectNameOut --stack "$STACK" 2>/dev/null)

echo "→ Deploying Pages assets (project: $PAGES_PROJECT)"
pnpm --filter @arena/web exec wrangler pages deploy dist --project-name "$PAGES_PROJECT" --commit-dirty=true
