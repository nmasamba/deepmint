import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { RateLimitMeta } from "./response";

/**
 * Per-API-key sliding-window rate limiter for the B2B REST API.
 *
 * Falls back to an in-memory stub when Upstash env vars are not set
 * (local dev), always allowing requests through but still returning
 * the shape required by the response helpers.
 */

const cache = new Map<number, Ratelimit>();

function getLimiter(limit: number): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const cached = cache.get(limit);
  if (cached) return cached;

  const rl = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, "1 m"),
    prefix: "deepmint:api:v1",
  });
  cache.set(limit, rl);
  return rl;
}

export async function checkRateLimit(
  keyId: string,
  limit: number,
): Promise<{ success: boolean; meta: RateLimitMeta }> {
  const limiter = getLimiter(limit);

  if (!limiter) {
    // Local dev: no-op, return permissive metadata
    return {
      success: true,
      meta: {
        limit,
        remaining: limit,
        reset: Math.floor(Date.now() / 1000) + 60,
      },
    };
  }

  const result = await limiter.limit(keyId);
  return {
    success: result.success,
    meta: {
      limit: result.limit,
      remaining: result.remaining,
      reset: Math.floor(result.reset / 1000),
    },
  };
}
