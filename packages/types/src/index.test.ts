import { describe, it, expect } from "vitest";
import { HealthResponseSchema, type ApiResponse } from "./index";

describe("ApiResponse", () => {
  it("ok branch has data", () => {
    const res: ApiResponse<number> = { ok: true, data: 42 };
    if (res.ok) expect(res.data).toBe(42);
  });

  it("error branch has error string", () => {
    const res: ApiResponse<number> = { ok: false, error: "oops" };
    if (!res.ok) expect(res.error).toBe("oops");
  });
});

describe("HealthResponseSchema", () => {
  it("parses a valid health response", () => {
    const result = HealthResponseSchema.safeParse({
      status: "ok",
      timestamp: new Date().toISOString(),
      env: "test",
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong status value", () => {
    const result = HealthResponseSchema.safeParse({
      status: "error",
      timestamp: new Date().toISOString(),
      env: "test",
    });
    expect(result.success).toBe(false);
  });
});
