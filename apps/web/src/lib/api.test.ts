import { describe, it, expect, afterEach } from "vitest";
import { api, apiPost } from "./api";

// Save and restore the real fetch between tests.
const realFetch = globalThis.fetch;

function fakeFetch(body: object, status = 200) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("api", () => {
  it("returns data on success", async () => {
    fakeFetch({ ok: true, data: { hello: "world" } });
    const result = await api<{ hello: string }>("/test");
    expect(result).toEqual({ hello: "world" });
  });

  it("throws on error response", async () => {
    fakeFetch({ ok: false, error: "not found" });
    await expect(api("/test")).rejects.toThrow("not found");
  });
});

describe("apiPost", () => {
  it("sends POST with JSON body", async () => {
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true, data: { done: true } }));
    }) as typeof fetch;

    await apiPost("/test", { key: "value" });

    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.body).toBe(JSON.stringify({ key: "value" }));
  });
});
