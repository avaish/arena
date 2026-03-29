# skeleton

A production-ready monorepo template.

**Stack:** TypeScript · [Hono](https://hono.dev) on Cloudflare Workers · React + Vite + Tailwind CSS on Cloudflare Pages · Cloudflare D1 (SQLite) · [Better Auth](https://better-auth.com) (passkey-only) · Zod · Pulumi IaC · pnpm workspaces · Turborepo · ESLint · Prettier · Vitest

## Structure

```
apps/
  api/          Hono API on Cloudflare Workers
  web/          React + Vite frontend on Cloudflare Pages
packages/
  db/           Drizzle schema + SQL migrations
  types/        Shared TypeScript types
infra/          Pulumi TypeScript IaC (two stacks: dev, prod)
.github/
  workflows/    deploy-prod.yml (push to main), deploy-dev.yml (PR preview)
```

## Local development

```bash
cp .env.example .env        # fill in tokens (only needed for deploy, not local dev)
pnpm install
pnpm db:generate            # generate the initial DB migration from schema
pnpm db:migrate:local       # apply migrations to local D1
pnpm dev                    # api → :8787, web → :5173
```

The web dev server proxies `/api/*` to `:8787`, so there are no CORS issues locally.

Auth is pre-configured for local dev — no extra setup needed. The local secret in `wrangler.toml` is intentionally insecure; replace all `BETTER_AUTH_SECRET` values before deploying.

## Deploying

### First-time setup

1. **Pulumi login**

   ```bash
   cd infra
   pulumi login
   pulumi stack init dev
   pulumi stack init prod
   ```

2. **Set stack secrets** (repeat for `--stack prod`)

   ```bash
   pulumi config set --secret cloudflareAccountId <your-account-id> --stack dev
   pulumi config set --secret betterAuthSecret $(openssl rand -base64 32) --stack dev
   ```

   The non-secret values (`workerName`, etc.) are already committed in `infra/Pulumi.dev.yaml`.

3. **First deploy**

   ```bash
   cd ..
   pnpm build
   pnpm deploy:dev
   ```

4. **Wire up wrangler.toml**

   After the first deploy, copy the output IDs into `apps/api/wrangler.toml`:

   ```bash
   cd infra
   pulumi stack output kvNamespaceId --stack dev    # → REPLACE_WITH_DEV_KV_NAMESPACE_ID
   pulumi stack output d1DatabaseId --stack dev     # → REPLACE_WITH_DEV_D1_DATABASE_ID
   ```

5. **Generate and apply DB migrations**
   ```bash
   pnpm db:generate        # creates the initial migration in packages/db/migrations/
   pnpm db:migrate:dev
   ```

Repeat steps 3–5 for prod (`--stack prod`, `pnpm deploy:prod`, `pnpm db:migrate:prod`).

### Auth environment variables

Auth env vars are **automatically derived** by Pulumi at deploy time:

| Variable             | Value (auto-derived)                               |
| -------------------- | -------------------------------------------------- |
| `BETTER_AUTH_SECRET` | From `pulumi config set --secret betterAuthSecret` |
| `BETTER_AUTH_URL`    | `https://<workerName>.<accountId>.workers.dev`     |
| `PASSKEY_RP_ID`      | `<pagesProjectName>.pages.dev`                     |
| `PASSKEY_ORIGIN`     | `https://<pagesProjectName>.pages.dev`             |

If you use **custom domains**, override before deploying:

```bash
pulumi config set passkeyOrigin https://myapp.com --stack prod
pulumi config set passkeyRpId myapp.com --stack prod
pulumi config set betterAuthUrl https://api.myapp.com --stack prod
```

### GitHub Actions (CI/CD)

Add these to your GitHub repo:

**Secrets** (Settings → Secrets → Actions):
| Name | Value |
|---|---|
| `PULUMI_ACCESS_TOKEN` | From [app.pulumi.com/account/tokens](https://app.pulumi.com/account/tokens) |
| `CLOUDFLARE_API_TOKEN` | CF token with Workers + Pages + KV + D1 scopes |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

**Variables** (Settings → Variables → Actions):
| Name | Value |
|---|---|
| `PAGES_PROJECT_NAME_DEV` | `skeleton-web-dev` |
| `PAGES_PROJECT_NAME_PROD` | `skeleton-web-prod` |

After this: push to `main` deploys prod; opening a PR deploys a dev preview (Pulumi posts the infra diff as a PR comment).

> `betterAuthSecret` and other auth vars are stored in the Pulumi stack's encrypted state — no extra GitHub secrets needed.

## Common commands

| Command                 | What it does                                         |
| ----------------------- | ---------------------------------------------------- |
| `pnpm dev`              | Start all services locally                           |
| `pnpm build`            | Build all packages (Turborepo)                       |
| `pnpm lint`             | ESLint across all packages                           |
| `pnpm test`             | Run Vitest across all packages                       |
| `pnpm format`           | Prettier write                                       |
| `pnpm format:check`     | Prettier check (CI)                                  |
| `pnpm deploy:dev`       | Build → `pulumi up --stack dev`                      |
| `pnpm deploy:prod`      | Build → `pulumi up --stack prod`                     |
| `pnpm db:generate`      | Generate a new Drizzle migration from schema changes |
| `pnpm db:migrate:local` | Apply migrations to local D1                         |
| `pnpm db:migrate:dev`   | Apply migrations to dev D1                           |
| `pnpm db:migrate:prod`  | Apply migrations to prod D1                          |

## Database workflow

```bash
# 1. Edit packages/db/src/schema.ts
# 2. Generate the SQL migration
pnpm db:generate

# 3. Review the file in packages/db/migrations/
# 4. Apply locally and test
pnpm db:migrate:local
pnpm dev

# 5. Commit and push — CI applies migrations to dev/prod after deploy
```

> The skeleton ships without pre-committed migrations. Run `pnpm db:generate` to create the initial migration from the current schema.

## Environment variables

See `.env.example`. These are only needed for deploying and are never committed.
For local dev, no env vars are required — wrangler emulates all bindings locally.

For the web app, `VITE_API_URL` is set automatically by Pulumi in the Pages project
deployment config. You don't set it manually.

Auth variables (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PASSKEY_*`) are set by Pulumi
on the Worker at deploy time. For local dev they come from `apps/api/wrangler.toml`.
