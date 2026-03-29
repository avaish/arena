import type { ApiResponse } from "@arena/types";

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error);
  return body.data;
}

export function apiPost<T>(path: string, data: unknown): Promise<T> {
  return api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
