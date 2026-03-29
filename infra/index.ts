import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

// ── Stack config ──────────────────────────────────────────────────────────────
const cfg = new pulumi.Config();
const accountId = cfg.requireSecret("cloudflareAccountId");
const workerName = cfg.require("workerName");
const pagesProjectName = cfg.require("pagesProjectName");
const kvNamespaceName = cfg.require("kvNamespaceName");
const d1DatabaseName = cfg.require("d1DatabaseName");
// Fetched from CF API by scripts/deploy.sh and passed in as config
const workersDevSubdomain = cfg.require("workersDevSubdomain");
const workerUrl = pulumi.interpolate`https://${workerName}.${workersDevSubdomain}.workers.dev`;

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
// Worker is deployed separately via `wrangler deploy` in scripts/deploy.sh.
// Web assets are deployed separately via `wrangler pages deploy` after `pulumi up`.
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
      environmentVariables: {
        WORKER_URL: workerUrl,
      },
      compatibilityDate: "2024-12-01",
      compatibilityFlags: ["nodejs_compat"],
    },
    preview: {
      environmentVariables: {
        WORKER_URL: workerUrl,
      },
      compatibilityDate: "2024-12-01",
    },
  },
});

// ── Outputs ───────────────────────────────────────────────────────────────────
// Copy kvNamespaceId and d1DatabaseId into apps/api/wrangler.toml after first `pulumi up`.
export const kvNamespaceId = kvNamespace.id;
export const d1DatabaseId = d1Database.id;
export const pagesProjectNameOut = pagesProject.name;
export { workerUrl };
