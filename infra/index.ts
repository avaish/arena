import * as fs from "fs";
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
const betterAuthUrl = cfg.require("betterAuthUrl");
const passkeyRpId = cfg.require("passkeyRpId");
const passkeyOrigin = cfg.require("passkeyOrigin");

const environment = stack === "prod" ? "production" : "development";
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
// Read the pre-built bundle (produced by `pnpm build` → wrangler --dry-run --outdir dist).
const workerBundle = path.join(repoRoot, "apps/api/dist/index.js");
const workerContent = fs.readFileSync(workerBundle, "utf-8");

const workerScript = new cloudflare.WorkersScript(
  "worker",
  {
    accountId,
    name: workerName,
    content: workerContent,
    module: true,
    compatibilityDate: "2024-12-01",
    compatibilityFlags: ["nodejs_compat"],
    kvNamespaceBindings: [{ name: "APP_KV", namespaceId: kvNamespace.id }],
    d1DatabaseBindings: [{ name: "APP_DB", databaseId: d1Database.id }],
    plainTextBindings: [
      { name: "ENVIRONMENT", text: environment },
      { name: "BETTER_AUTH_URL", text: betterAuthUrl },
      { name: "PASSKEY_RP_ID", text: passkeyRpId },
      { name: "PASSKEY_ORIGIN", text: passkeyOrigin },
    ],
    secretTextBindings: [{ name: "BETTER_AUTH_SECRET", text: betterAuthSecret }],
  },
  { dependsOn: [kvNamespace, d1Database] }
);

// ── 5. Deploy Pages Assets ────────────────────────────────────────────────────
// Always re-deploys — wrangler skips unchanged files.
const pagesDeploy = new local.Command(
  "pages-deploy",
  {
    create: `${wrangler} pages deploy dist --project-name ${pagesProjectName} --commit-dirty=true`,
    update: `${wrangler} pages deploy dist --project-name ${pagesProjectName} --commit-dirty=true`,
    dir: path.join(repoRoot, "apps/web"),
    triggers: [Date.now().toString()],
  },
  { dependsOn: [pagesProject, workerScript] }
);

// ── Outputs ───────────────────────────────────────────────────────────────────
export const kvNamespaceId = kvNamespace.id;
export const d1DatabaseId = d1Database.id;
export const pagesProjectNameOut = pagesProject.name;
export const pagesDeployUrl = pagesDeploy.stdout;
export { workerUrl };
