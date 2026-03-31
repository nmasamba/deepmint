import { pgTable, uuid, varchar, numeric, date, timestamp } from 'drizzle-orm/pg-core';
import { entities } from './entities';

export const scores = pgTable('scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  metric: varchar('metric', { length: 50 }).notNull(),
  // Metrics: sharpe, calmar, cvar5, max_drawdown, hit_rate_3m, hit_rate_6m,
  //          hit_rate_12m, avg_return_bps, calibration_brier, consistency,
  //          eiv, overall_player, overall_guide
  value: numeric('value', { precision: 18, scale: 6 }).notNull(),
  horizon: varchar('horizon', { length: 10 }),                       // '3m', '6m', '12m', 'all'
  regimeTag: varchar('regime_tag', { length: 50 }),                  // 'bull', 'bear', 'high_vol', etc.
  asOfDate: date('as_of_date').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});

// UNIQUE: one score per entity per metric per horizon per regime per date
