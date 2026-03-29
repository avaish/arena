import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
  env: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// Discriminated union so TypeScript narrows correctly:
//   if (body.ok) body.data  — body.error not accessible on success branch
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };
