import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS);
