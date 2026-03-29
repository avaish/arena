import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
import * as fs from "fs";
import * as path from "path";

// ── Stack config ──────────────────────────────────────────────────────────────
const cfg = new pulumi.Config();
const accountId = cfg.requireSecret("cloudflareAccountId");
const workerName = cfg.require("workerName");
const pagesProjectName = cfg.require("pagesProjectName");
const kvNamespaceName = cfg.require("kvNamespaceName");
const d1DatabaseName = cfg.require("d1DatabaseName");
const workerEnv = cfg.require("workerEnv");
// Auth — set with: pulumi config set --secret betterAuthSecret <value> --stack <dev|prod>
const betterAuthSecret = cfg.requireSecret("betterAuthSecret");
// Derived from existing config; override via pulumi config set if using custom domains
const betterAuthUrl = pulumi.interpolate`https://${workerName}.${accountId}.workers.dev`;
const passkeyOrigin = `https://${pagesProjectName}.pages.dev`;
const passkeyRpId = `${pagesProjectName}.pages.dev`;

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

// ── 3. Worker Script ──────────────────────────────────────────────────────────
// Built by `wrangler deploy --dry-run --outdir dist` in apps/api.
// Turborepo ensures apps/api builds before infra runs `pulumi up`.
const workerBundle = fs.readFileSync(
  path.resolve(__dirname, "../apps/api/dist/arena-api.js"),
  "utf-8"
);

const worker = new cloudflare.WorkersScript("api", {
  accountId,
  name: workerName,
  content: workerBundle,
  module: true,
  kvNamespaceBindings: [{ name: "APP_KV", namespaceId: kvNamespace.id }],
  d1DatabaseBindings: [{ name: "APP_DB", databaseId: d1Database.id }],
  plainTextBindings: [
    { name: "ENVIRONMENT", text: workerEnv },
    { name: "BETTER_AUTH_URL", text: betterAuthUrl },
    { name: "PASSKEY_ORIGIN", text: passkeyOrigin },
    { name: "PASSKEY_RP_ID", text: passkeyRpId },
  ],
  secretTextBindings: [{ name: "BETTER_AUTH_SECRET", text: betterAuthSecret }],
});

// ── 4. Pages Project ──────────────────────────────────────────────────────────
// Configures the project. Web assets are deployed separately via
// `wrangler pages deploy apps/web/dist` in CI after `pulumi up`.
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
        VITE_API_URL: pulumi.interpolate`https://${worker.name}.${accountId}.workers.dev`,
      },
      compatibilityDate: "2024-12-01",
      compatibilityFlags: ["nodejs_compat"],
    },
    preview: {
      environmentVariables: {
        VITE_API_URL: pulumi.interpolate`https://${worker.name}.${accountId}.workers.dev`,
      },
      compatibilityDate: "2024-12-01",
    },
  },
});

// ── Outputs ───────────────────────────────────────────────────────────────────
// Copy these IDs into apps/api/wrangler.toml after first `pulumi up`.
export const kvNamespaceId = kvNamespace.id;
export const d1DatabaseId = d1Database.id;
export const workerScriptName = worker.name;
export const pagesProjectNameOut = pagesProject.name;
export const workerUrl = pulumi.interpolate`https://${worker.name}.${accountId}.workers.dev`;
