import { pgTable, uuid, text, varchar, timestamp } from 'drizzle-orm/pg-core';
import { entities } from './entities';

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  sourceUrl: varchar('source_url', { length: 2000 }),
  rawText: text('raw_text').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),    // SHA-256 hex
  snapshotPath: varchar('snapshot_path', { length: 500 }),            // R2 key for screenshot/PDF
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // NO updatedAt — this table is immutable
});
