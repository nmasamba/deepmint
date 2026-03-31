import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { claims } from './claims';
import { entities } from './entities';

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  claimId: uuid('claim_id').references(() => claims.id).notNull(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  noteText: text('note_text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // NO updatedAt — append-only
});
