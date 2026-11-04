import { pgTable, uuid, date, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

export const auditRoots = pgTable('audit_roots', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date').unique().notNull(),
  merkleRoot: varchar('merkle_root', { length: 64 }).notNull(),
  claimCount: integer('claim_count').notNull(),
  // Which leaf hash built this root (sh/merkle.ts). 1 stays the default so a
  // root written by code from before version 2 is labelled correctly.
  leafVersion: integer('leaf_version').default(1).notNull(),
  bitcoinTxId: varchar('bitcoin_tx_id', { length: 64 }),             // OpenTimestamps anchor
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});
