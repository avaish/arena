# Claude Code guidance

## Project overview

Sports app monorepo: Hono API (Cloudflare Workers) + React/Vite frontend (Cloudflare Pages) + D1 database (SQLite/Drizzle) + Better Auth (passkey-only) + Pulumi IaC. Two deployment environments: `dev` and `prod`.

## Commands

```bash
pnpm dev                  # start all services locally
pnpm build                # turbo build (types → db → api/web in parallel)
pnpm lint                 # ESLint across all packages
pnpm test                 # vitest run across all packages (requires pnpm build first)
pnpm format               # Prettier write
pnpm format:check         # Prettier check (used in CI)
pnpm deploy:dev           # build + pulumi up --stack dev
pnpm deploy:prod          # build + pulumi up --stack prod
pnpm db:generate          # drizzle-kit generate (run after editing packages/db/src/schema.ts)
pnpm db:migrate:local     # apply migrations to local D1
pnpm db:migrate:dev       # apply migrations to dev D1
pnpm db:migrate:prod      # apply migrations to prod D1
```

## Key files

- `apps/api/src/index.ts` — Hono app, Worker entry point. All routes under `/api/*`.
- `apps/api/src/auth.ts` — Better Auth factory (`createAuth(env)`). Called per-request; mounts at `/api/auth/**`.
- `apps/api/wrangler.toml` — Worker config. Three environments: (top-level) local, `dev`, `prod`.
- `apps/web/src/App.tsx` — Frontend entry. Uses `VITE_API_URL` env var in prod; Vite proxy in dev.
- `apps/web/src/auth.ts` — Better Auth client (`authClient`). Import this anywhere you need auth state or actions.
- `packages/db/src/schema.ts` — Drizzle table definitions. Edit this to change the DB schema.
- `packages/types/src/index.ts` — Zod schemas + derived TS types shared by api and web. Schemas are the source of truth; types are `z.infer<>` aliases.
- `infra/index.ts` — Pulumi program. Manages KV namespace, D1 database, Workers script, Pages project.

## Architecture notes

- **Build pipeline:** Turborepo ensures `packages/types` and `packages/db` build before `apps/api` and `apps/web` via `"dependsOn": ["^build"]`.
- **Infra split:** Pulumi manages infrastructure (KV, D1, Worker code, Pages project config). `wrangler pages deploy` uploads web assets per-commit in CI.
- **Local dev proxy:** Vite proxies `/api/*` → `localhost:8787` (wrangler dev). No CORS in local dev.
- **API URL:** In deployed environments, the frontend uses relative URLs (`/api/*`) which are intercepted by the Pages Function proxy. `VITE_API_URL` is not used. The Pages Function reads `WORKER_URL` from its runtime env (set by Pulumi).
- **Worker bundle:** `wrangler deploy --dry-run --outdir dist` in `apps/api` produces `dist/index.js`. Pulumi reads this file and uploads it.
- **D1 IDs in wrangler.toml:** After first `pulumi up`, copy output IDs from `pulumi stack output` into the `REPLACE_WITH_*` placeholders in `apps/api/wrangler.toml`.

- **Auth (Better Auth):** Passkey-only. `createAuth(env)` is called per-request so it picks up the D1 binding. Auth is mounted at `GET|POST /api/auth/**` in Hono. The `anonymous` plugin creates a user on registration; the `passkey` plugin attaches the credential. Sign-in is purely passkey (no email/password). Auth env vars (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PASSKEY_RP_ID`, `PASSKEY_ORIGIN`) are set by Pulumi at deploy time; locally `BETTER_AUTH_SECRET` comes from `apps/api/.dev.vars` (gitignored), the rest from `wrangler.toml` `[vars]`.
- **Pages Function proxy (`apps/web/functions/api/[[path]].js`):** Routes all `/api/*` requests from the Pages frontend to the Worker. Required because Safari ITP blocks third-party cookies — without the proxy, the Worker (`workers.dev`) and Pages (`pages.dev`) are different origins, and Safari won't send cookies cross-site. The proxy makes everything same-origin from the browser's perspective. `WORKER_URL` is injected into the Pages Function at runtime by Pulumi (set in Pages deployment config). If you move to a custom domain where both services share the same registered domain, the proxy can be removed.
- **Empty POST body fix (`apps/api/src/index.ts`):** Better Auth's internal router (`better-call`) calls `request.json()` on all `application/json` POST requests. Some auth endpoints (e.g., anonymous sign-in) send a POST with `Content-Length: 0` and no body, which causes `SyntaxError: Unexpected end of JSON input`. The fix intercepts POST requests with `Content-Length: 0` and injects an empty JSON body `{}` before passing to Better Auth. This is a known `better-call` issue (Better Auth #3658, Hono #562).
- **DB migrations:** Run `pnpm db:generate` after editing `packages/db/src/schema.ts`, then `pnpm db:migrate:local` / `db:migrate:dev` / `db:migrate:prod` to apply. Dev/prod use `--remote` (wrangler v4 requirement).
- **Zod schemas:** Defined in `packages/types/src/index.ts`. Add a `z.object(...)` schema and export a `z.infer<>` type alias. Use `zValidator("json", MySchema)` in Hono route handlers — `c.req.valid("json")` is then fully typed.
- **Tailwind CSS v4:** Configured via `@import "tailwindcss"` in `apps/web/src/index.css`. No `tailwind.config.js` needed.
- **Testing:** `apps/api` and `packages/types` have test files. `apps/web` has a vitest config with jsdom for future component tests; add `*.test.tsx` files there when needed.
- **ESLint config:** Root `eslint.config.js` covers all packages. React rules apply only to `apps/web/**`.

## Adding a new API route

1. Add the Zod input schema (if any) to `packages/types/src/index.ts`.
2. Add the handler in `apps/api/src/index.ts` using `zValidator("json", MySchema)` for request validation.
3. To protect a route, add the `requireAuth` middleware: `app.get("/api/route", requireAuth, (c) => ...)`. The session is then available as `c.var.user` and `c.var.session`.
4. If it needs new DB tables, edit `packages/db/src/schema.ts` and run `pnpm db:generate`.
5. Add a test in `apps/api/src/index.test.ts`.

## Adding a new package

1. Create `packages/<name>/` with `package.json` (`name: "@arena/<name>"`), `tsconfig.json`, `src/index.ts`.
2. `"packages/<name>"` is already covered by `"packages/*"` in `pnpm-workspace.yaml`.
3. Import with `"@arena/<name>": "workspace:*"` in the consuming package's `package.json`.
