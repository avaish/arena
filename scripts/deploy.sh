#!/bin/bash
set -e

STACK=${1:?Usage: deploy.sh <dev|prod>}

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "→ Building"
pnpm turbo run build --force

echo "→ Deploying (stack: $STACK)"
pnpm --filter infra exec pulumi up --stack "$STACK" --yes
