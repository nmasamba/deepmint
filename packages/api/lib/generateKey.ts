import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a new B2B API key.
 *
 * Format: dm_live_<32 random hex chars>
 * The plaintext key is returned to the caller exactly ONCE on creation.
 * Only the SHA-256 hash is persisted.
 */
export function generateKey(): { plaintext: string; hash: string; prefix: string } {
  const secret = randomBytes(16).toString("hex"); // 32 chars
  const plaintext = `dm_live_${secret}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, 16); // "dm_live_" + first 8 secret chars
  return { plaintext, hash, prefix };
}
