import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { ApiResponse, HealthResponse } from "@arena/types";
import { createAuth } from "./auth";

type Bindings = {
  APP_KV: KVNamespace;
  APP_DB: D1Database;
  ENVIRONMENT: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  PASSKEY_RP_ID: string;
  PASSKEY_ORIGIN: string;
};

type Variables = {
  user: { id: string; email: string | null; isAnonymous?: boolean | null };
  session: { id: string; userId: string };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      origin?.endsWith(".pages.dev") || origin === "http://localhost:5173" ? origin : "",
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ── Auth middleware ────────────────────────────────────────────────────────────
// Use on any route that requires a valid session.
// On success, c.var.user and c.var.session are populated.
const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const session = await createAuth(c.env).api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session) {
      return c.json<ApiResponse<never>>({ ok: false, error: "unauthorized" }, 401);
    }
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  }
);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/api/health", (c) => {
  const body: ApiResponse<HealthResponse> = {
    ok: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      env: c.env.ENVIRONMENT,
    },
  };
  return c.json(body);
});

// Protected route example — add requireAuth to any route you want to guard.
// c.var.user and c.var.session are typed and available after the middleware runs.
app.get("/api/me", requireAuth, (c) => {
  return c.json<ApiResponse<{ userId: string }>>({
    ok: true,
    data: { userId: c.var.user.id },
  });
});

app.on(["GET", "POST"], "/api/auth/**", async (c) => {
  let req = c.req.raw;
  const contentLengthHeader = c.req.header("content-length");
  if (c.req.method === "POST" && contentLengthHeader === "0") {
    const headers = new Headers(req.headers);
    headers.set("content-length", "2");
    req = new Request(req.url, {
      method: req.method,
      headers,
      body: "{}",
      duplex: "half",
    } as RequestInit);
  }
  return createAuth(c.env).handler(req);
});

// ── Error handling ────────────────────────────────────────────────────────────

app.notFound((c) => c.json<ApiResponse<never>>({ ok: false, error: "not found" }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json<ApiResponse<never>>({ ok: false, error: err.message }, 500);
});

export default app;
