import { pgTable, uuid, varchar, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { entities } from './entities';

/**
 * API keys for B2B clients accessing the public REST API at /api/v1/.
 * Keys are never stored in plaintext; only the SHA-256 hash is kept.
 */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),           // human-readable label
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(), // SHA-256 hex
  keyPrefix: varchar('key_prefix', { length: 16 }).notNull(), // display-only prefix e.g. "dm_live_a1b2c3d4"
  createdBy: uuid('created_by').references(() => entities.id),
  scopes: jsonb('scopes').$type<string[]>().default(['scores:read', 'consensus:read', 'leaderboard:read']).notNull(),
  rateLimit: integer('rate_limit').notNull().default(60),     // requests per minute
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
