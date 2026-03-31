import { pgTable, uuid, integer, timestamp, jsonb, pgEnum, text } from 'drizzle-orm/pg-core';
import { entities } from './entities';
import { instruments } from './instruments';
import { events } from './events';

export const directionEnum = pgEnum('direction', ['long', 'short', 'neutral']);
export const claimStatusEnum = pgEnum('claim_status', ['pending_review', 'active', 'rejected']);

export const claims = pgTable('claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').references(() => events.id),             // null for Player self-logged
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  instrumentId: uuid('instrument_id').references(() => instruments.id).notNull(),
  direction: directionEnum('direction').notNull(),
  targetPriceCents: integer('target_price_cents'),                    // optional price target
  horizonDays: integer('horizon_days').notNull(),                     // 1, 7, 30, 90, 180, 365
  confidence: integer('confidence'),                                   // 0-100, optional
  rationale: text('rationale'),                                        // free-text reasoning
  rationaleTags: jsonb('rationale_tags').$type<string[]>().default([]),// e.g. ['earnings', 'technical']
  status: claimStatusEnum('claim_status').default('active'),
  entryPriceCents: integer('entry_price_cents'),                      // price at claim creation
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // NO updatedAt — immutable
});
