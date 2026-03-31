import { pgTable, uuid, integer, numeric, date, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { entities } from './entities';
import { claims } from './claims';
import { instruments } from './instruments';

// Tracks when a Player's action follows a Guide's claim within a time window
export const influenceEvents = pgTable('influence_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  guideEntityId: uuid('guide_entity_id').references(() => entities.id).notNull(),
  guideClaimId: uuid('guide_claim_id').references(() => claims.id).notNull(),
  playerEntityId: uuid('player_entity_id').references(() => entities.id).notNull(),
  playerClaimId: uuid('player_claim_id').references(() => claims.id),
  playerTradeId: uuid('player_trade_id'),
  instrumentId: uuid('instrument_id').references(() => instruments.id).notNull(),
  lagHours: numeric('lag_hours', { precision: 10, scale: 2 }).notNull(),
  directionMatch: boolean('direction_match').notNull(),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
});

// Aggregated influence scores (recomputed nightly)
export const influenceScores = pgTable('influence_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  guideEntityId: uuid('guide_entity_id').references(() => entities.id).notNull(),
  followerCount: integer('follower_count').notNull().default(0),
  influenceEvents30d: integer('influence_events_30d').notNull().default(0),
  avgLagHours: numeric('avg_lag_hours', { precision: 10, scale: 2 }),
  topInstruments: jsonb('top_instruments').$type<string[]>().default([]),
  asOfDate: date('as_of_date').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});
