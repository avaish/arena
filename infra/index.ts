import * as path from "path";
import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
import { local } from "@pulumi/command";

// ── Stack config ──────────────────────────────────────────────────────────────
const cfg = new pulumi.Config();
const stack = pulumi.getStack(); // "dev" or "prod" — matches wrangler.toml [env.*]
const accountId = cfg.requireSecret("cloudflareAccountId");
const workerName = cfg.require("workerName");
const pagesProjectName = cfg.require("pagesProjectName");
const kvNamespaceName = cfg.require("kvNamespaceName");
const d1DatabaseName = cfg.require("d1DatabaseName");
const workersDevSubdomain = cfg.require("workersDevSubdomain");
const betterAuthSecret = cfg.requireSecret("betterAuthSecret");

const workerUrl = pulumi.interpolate`https://${workerName}.${workersDevSubdomain}.workers.dev`;

// infra/ is one level below the monorepo root
const repoRoot = path.resolve(__dirname, "..");
const wrangler = path.join(repoRoot, "node_modules/.bin/wrangler");

// ── 1. KV Namespace ───────────────────────────────────────────────────────────
const kvNamespace = new cloudflare.WorkersKvNamespace("kv", {
  accountId,
  title: kvNamespaceName,
});

// ── 2. D1 Database ────────────────────────────────────────────────────────────
const d1Database = new cloudflare.D1Database("db", {
  accountId,
  name: d1DatabaseName,
});

// ── 3. Pages Project ──────────────────────────────────────────────────────────
const pagesProject = new cloudflare.PagesProject("web", {
  accountId,
  name: pagesProjectName,
  productionBranch: "main",
  buildConfig: {
    buildCommand: "pnpm --filter @arena/web build",
    destinationDir: "dist",
    rootDir: "apps/web",
  },
  deploymentConfigs: {
    production: {
      environmentVariables: { WORKER_URL: workerUrl },
      compatibilityDate: "2024-12-01",
      compatibilityFlags: ["nodejs_compat"],
    },
    preview: {
      environmentVariables: { WORKER_URL: workerUrl },
      compatibilityDate: "2024-12-01",
    },
  },
});

// ── 4. Deploy Worker ──────────────────────────────────────────────────────────
// Re-deploys only when the compiled bundle changes.
const workerBundle = new pulumi.asset.FileAsset(
  path.join(repoRoot, "apps/api/dist/index.js"),
);

const workerDeploy = new local.Command(
  "worker-deploy",
  {
    create: `${wrangler} deploy --env ${stack}`,
    update: `${wrangler} deploy --env ${stack}`,
    dir: path.join(repoRoot, "apps/api"),
    triggers: [workerBundle],
  },
  { dependsOn: [kvNamespace, d1Database] },
);

// ── 5. Set BETTER_AUTH_SECRET on Worker ──────────────────────────────────────
// wrangler reads the secret from stdin when passed .
const workerSecret = new local.Command(
  "worker-secret",
  {
    create: `${wrangler} secret put BETTER_AUTH_SECRET --env ${stack} `,
    update: `${wrangler} secret put BETTER_AUTH_SECRET --env ${stack} `,
    dir: path.join(repoRoot, "apps/api"),
    stdin: betterAuthSecret,
    triggers: [betterAuthSecret],
  },
  { dependsOn: [workerDeploy] },
);

// ── 6. Deploy Pages Assets ────────────────────────────────────────────────────
// Re-deploys when index.html changes (Vite rewrites it whenever any chunk hash changes).
const webIndex = new pulumi.asset.FileAsset(
  path.join(repoRoot, "apps/web/dist/index.html"),
);

const pagesDeploy = new local.Command(
  "pages-deploy",
  {
    create: `${wrangler} pages deploy dist --project-name ${pagesProjectName} --commit-dirty=true`,
    update: `${wrangler} pages deploy dist --project-name ${pagesProjectName} --commit-dirty=true`,
    dir: path.join(repoRoot, "apps/web"),
    triggers: [webIndex],
  },
  { dependsOn: [pagesProject, workerDeploy] },
);

// ── Outputs ───────────────────────────────────────────────────────────────────
export const kvNamespaceId = kvNamespace.id;
export const d1DatabaseId = d1Database.id;
export const pagesProjectNameOut = pagesProject.name;
export const pagesDeployUrl = pagesDeploy.stdout;
export { workerUrl };
