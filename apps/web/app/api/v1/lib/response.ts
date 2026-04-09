import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Standard JSON response envelope for the B2B REST API.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export interface RateLimitMeta {
  limit: number;
  remaining: number;
  reset: number; // unix seconds
}

function buildHeaders(rateLimit?: RateLimitMeta): Record<string, string> {
  const headers: Record<string, string> = { ...CORS_HEADERS };
  if (rateLimit) {
    headers["X-RateLimit-Limit"] = String(rateLimit.limit);
    headers["X-RateLimit-Remaining"] = String(rateLimit.remaining);
    headers["X-RateLimit-Reset"] = String(rateLimit.reset);
  }
  return headers;
}

export function jsonSuccess<T>(
  data: T,
  opts?: { rateLimit?: RateLimitMeta; status?: number },
): NextResponse {
  return NextResponse.json(
    {
      data,
      meta: {
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
      },
    },
    {
      status: opts?.status ?? 200,
      headers: buildHeaders(opts?.rateLimit),
    },
  );
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  opts?: { rateLimit?: RateLimitMeta },
): NextResponse {
  return NextResponse.json(
    {
      error: { code, message },
      meta: {
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
      },
    },
    {
      status,
      headers: buildHeaders(opts?.rateLimit),
    },
  );
}

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
