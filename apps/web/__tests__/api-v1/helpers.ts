/**
 * Shared helpers for B2B REST API integration tests.
 *
 * Prerequisites:
 * - Running dev server at TEST_BASE_URL (default http://localhost:3000)
 * - TEST_API_KEY set in .env.local (a valid dm_live_* plaintext key)
 */

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
export const API_KEY = process.env.TEST_API_KEY ?? "";

export function authHeaders(key?: string): Record<string, string> {
  return { Authorization: `Bearer ${key ?? API_KEY}` };
}

export async function fetchApi(
  path: string,
  opts?: { key?: string | null; headers?: Record<string, string> },
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...opts?.headers,
  };

  // Add auth unless explicitly null
  if (opts?.key !== null) {
    Object.assign(headers, authHeaders(opts?.key ?? undefined));
  }

  return fetch(`${BASE_URL}${path}`, { headers });
}
