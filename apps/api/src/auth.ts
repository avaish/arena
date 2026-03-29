import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { anonymous } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@arena/db";

type AuthEnv = {
  APP_DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  PASSKEY_RP_ID: string;
  PASSKEY_ORIGIN: string;
};

export function createAuth(env: AuthEnv) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PASSKEY_ORIGIN, `https://*.${env.PASSKEY_RP_ID}`],
    database: drizzleAdapter(drizzle(env.APP_DB, { schema }), {
      provider: "sqlite",
    }),
    plugins: [
      anonymous(),
      passkey({
        rpID: env.PASSKEY_RP_ID,
        rpName: "Arena",
      }),
    ],
  });
}
