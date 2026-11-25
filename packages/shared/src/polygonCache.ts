/**
 * Redis cache layer for market data (Massive.com / Polygon.io).
 * Uses Upstash Redis when configured, otherwise bypasses cache.
 *
 * TTLs:
 * - Regime indicators: 1 hour (set by their caller)
 * - Latest closes: 5 minutes
 */

// ---------------------------------------------------------------------------
// Redis client (lazy, bypasses when not configured)
// ---------------------------------------------------------------------------

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
}

let redis: RedisLike | null | undefined;

async function getRedis(): Promise<RedisLike | null> {
  if (redis !== undefined) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    redis = null;
    return null;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    // getCached stores and parses JSON itself. The client would otherwise parse
    // it on get, and parsing its object again fails, so every read would miss.
    redis = new Redis({ url, token, automaticDeserialization: false });
    return redis;
  } catch {
    redis = null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const TTL_CURRENT = 300; // 5 minutes

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const r = await getRedis();

  if (r) {
    try {
      const cached = await r.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {
      // Redis read failed, proceed to fetch
    }
  }

  const result = await fetcher();

  if (r) {
    try {
      await r.set(key, JSON.stringify(result), { ex: ttlSeconds });
    } catch {
      // Redis write failed, non-fatal
    }
  }

  return result;
}

export function currentPriceCacheKey(ticker: string): {
  key: string;
  ttl: number;
} {
  return { key: `price:current:${ticker.toUpperCase()}`, ttl: TTL_CURRENT };
}

export { TTL_CURRENT };
