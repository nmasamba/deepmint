import { createHash } from "node:crypto";
import { db, eq, and } from "@deepmint/db";
import { apiKeys } from "@deepmint/db/schema";
import { jsonError, type RateLimitMeta } from "./response";
import { checkRateLimit } from "./rateLimit";

export interface AuthenticatedKey {
  id: string;
  name: string;
  scopes: string[];
  rateLimit: number;
}

export interface AuthResult {
  ok: true;
  key: AuthenticatedKey;
  rateLimit: RateLimitMeta;
}

export interface AuthFailure {
  ok: false;
  response: Response;
}

/**
 * Authenticate an incoming B2B API request.
 *
 * Pipeline:
 *   1. Extract `Authorization: Bearer dm_live_xxx` header
 *   2. SHA-256 hash the key and look it up
 *   3. Verify isActive, not expired, not revoked
 *   4. Check the required scope
 *   5. Apply per-key rate limit
 *   6. Update lastUsedAt (best-effort)
 */
export async function authenticateRequest(
  req: Request,
  requiredScope: "scores:read" | "consensus:read" | "leaderboard:read",
): Promise<AuthResult | AuthFailure> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      response: jsonError(
        "UNAUTHORIZED",
        "Missing Authorization: Bearer header",
        401,
      ),
    };
  }

  const token = header.slice(7).trim();
  if (!token.startsWith("dm_live_")) {
    return {
      ok: false,
      response: jsonError("UNAUTHORIZED", "Invalid API key format", 401),
    };
  }

  const hash = createHash("sha256").update(token).digest("hex");

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!row) {
    return {
      ok: false,
      response: jsonError("UNAUTHORIZED", "Invalid or revoked API key", 401),
    };
  }

  if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
    return {
      ok: false,
      response: jsonError("UNAUTHORIZED", "API key has expired", 401),
    };
  }

  const scopes = (row.scopes as string[] | null) ?? [];
  if (!scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: jsonError(
        "FORBIDDEN",
        `API key missing required scope: ${requiredScope}`,
        403,
      ),
    };
  }

  const { success, meta } = await checkRateLimit(row.id, row.rateLimit);
  if (!success) {
    return {
      ok: false,
      response: jsonError("RATE_LIMITED", "Rate limit exceeded", 429, {
        rateLimit: meta,
      }),
    };
  }

  // Best-effort update of lastUsedAt (don't await or fail on error)
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => {
      // ignore
    });

  return {
    ok: true,
    key: {
      id: row.id,
      name: row.name,
      scopes,
      rateLimit: row.rateLimit,
    },
    rateLimit: meta,
  };
}
