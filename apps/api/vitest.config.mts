import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

config({ path: "../../.env" });

export default defineConfig(async () => {
  const migrations = await readD1Migrations("../../packages/db/migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./src/test-setup.ts"],
    },
  };
});
