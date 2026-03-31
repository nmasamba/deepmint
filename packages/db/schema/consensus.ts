import { pgTable, uuid, integer, numeric, date, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { instruments } from './instruments';

export const consensusDirectionEnum = pgEnum('consensus_direction', ['bullish', 'bearish', 'neutral']);

export const consensusSignals = pgTable('consensus_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  instrumentId: uuid('instrument_id').references(() => instruments.id).notNull(),
  direction: consensusDirectionEnum('direction').notNull(),
  longCount: integer('long_count').notNull().default(0),
  shortCount: integer('short_count').notNull().default(0),
  neutralCount: integer('neutral_count').notNull().default(0),
  weightedBullishScore: numeric('weighted_bullish_score', { precision: 18, scale: 6 }).notNull().default('0'),
  weightedBearishScore: numeric('weighted_bearish_score', { precision: 18, scale: 6 }).notNull().default('0'),
  weightedNeutralScore: numeric('weighted_neutral_score', { precision: 18, scale: 6 }).notNull().default('0'),
  convictionStrength: numeric('conviction_strength', { precision: 5, scale: 4 }).notNull().default('0'),
  avgTargetPriceCents: integer('avg_target_price_cents'),
  targetDispersionBps: integer('target_dispersion_bps'),
  activeClaims: integer('active_claims').notNull().default(0),
  asOfDate: date('as_of_date').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});
