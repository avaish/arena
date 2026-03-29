import { describe, it, expect } from "vitest";
import app from "./index";

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await app.request("/api/health", {}, { ENVIRONMENT: "test" } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.env).toBe("test");
  });
});

describe("GET /api/me", () => {
  it("returns 401 without auth", async () => {
    // APP_DB: {} is safe — getSession with no credentials returns null before any DB query
    const res = await app.request("/api/me", {}, { ENVIRONMENT: "test", APP_DB: {} } as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });
});
