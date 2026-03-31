import { pgTable, uuid, integer, timestamp, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { claims } from './claims';
import { instruments } from './instruments';

export const horizonEnum = pgEnum('horizon', ['1d', '1w', '1m', '3m', '6m', '1y']);

export const outcomes = pgTable('outcomes', {
  id: uuid('id').primaryKey().defaultRandom(),
  claimId: uuid('claim_id').references(() => claims.id).notNull(),
  instrumentId: uuid('instrument_id').references(() => instruments.id).notNull(),
  horizon: horizonEnum('horizon').notNull(),
  entryPriceCents: integer('entry_price_cents').notNull(),
  exitPriceCents: integer('exit_price_cents').notNull(),
  returnBps: integer('return_bps').notNull(),                         // basis points (100 = 1%)
  directionCorrect: boolean('direction_correct').notNull(),
  targetHit: boolean('target_hit'),                                   // null if no target was set
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});

// UNIQUE constraint: one outcome per claim per horizon
// CREATE UNIQUE INDEX idx_outcomes_claim_horizon ON outcomes(claim_id, horizon);
