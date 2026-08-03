import { pgTable, uuid, integer, timestamp, jsonb, pgEnum, text, varchar } from 'drizzle-orm/pg-core';
import { entities } from './entities';
import { instruments } from './instruments';
import { events } from './events';

export const directionEnum = pgEnum('direction', ['long', 'short', 'neutral']);
export const claimStatusEnum = pgEnum('claim_status', ['pending_review', 'active', 'rejected']);

/**
 * Which ingestion lane produced a claim. All lanes share this single ledger so
 * that a Wall Street institution and an independent analyst compete on one
 * leaderboard — the separation lives in the adapters, not in storage.
 */
export const sourceKindEnum = pgEnum('source_kind', [
  'wall_street_rating', // third-party analyst call recovered from news/ratings data
  'analyst_feed',       // a Guide publishing their own views via their feed
  'self_logged',        // submitted in-app by the owning entity (tRPC / MCP)
]);

export const ratingGradeEnum = pgEnum('rating_grade', [
  'strong_buy', 'buy', 'hold', 'sell', 'strong_sell',
]);

export const ratingActionEnum = pgEnum('rating_action', [
  'initiate', 'upgrade', 'downgrade', 'maintain', 'reiterate',
]);

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
  // Rating attribution — all nullable with NO default, so existing rows are
  // untouched by the migration (append-only invariant). Null source_kind means
  // a row that predates lane classification.
  sourceKind: sourceKindEnum('source_kind'),
  ratingGrade: ratingGradeEnum('rating_grade'),                       // Buy/Hold/Sell, when stated
  ratingAction: ratingActionEnum('rating_action'),                    // upgrade/downgrade/initiate...
  analystName: varchar('analyst_name', { length: 200 }),              // individual analyst, when named
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // NO updatedAt — immutable
});
