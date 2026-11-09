import { pgTable, uuid, varchar, numeric, date, timestamp, unique } from 'drizzle-orm/pg-core';
import { entities } from './entities';

export const scores = pgTable('scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  metric: varchar('metric', { length: 50 }).notNull(),
  // Metrics written by the scoring worker (apps/worker/functions/score.ts),
  // all with horizon 'all' unless noted:
  //   every entity: hit_rate, avg_return_bps, eiv_overall
  //   by regime:    eiv and regime_outcome_count, tagged with the current
  //                 regime, for an entity with at least 5 outcomes entered
  //                 in it
  //   Guides:       z_score, target_coverage, calibration_brier (when any
  //                 claim has a confidence), target_precision (when any claim
  //                 has a target), and hit_rate per horizon
  //   Players:      sharpe, max_drawdown, calmar, cvar5, consistency
  value: numeric('value', { precision: 18, scale: 6 }).notNull(),
  horizon: varchar('horizon', { length: 10 }),                       // 'all', '1d', '1w', '1m', '3m', '6m', '1y'
  regimeTag: varchar('regime_tag', { length: 50 }),                  // 'bull', 'bear', 'high_vol', etc.
  asOfDate: date('as_of_date').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // One score per entity per metric per horizon per regime per date; a null
  // horizon or regime counts as a value.
  unique('scores_entity_metric_horizon_regime_date_unique')
    .on(t.entityId, t.metric, t.horizon, t.regimeTag, t.asOfDate)
    .nullsNotDistinct(),
]);
