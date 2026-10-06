import { pgTable, uuid, varchar, numeric, integer, jsonb, date, timestamp } from 'drizzle-orm/pg-core';

/**
 * One market-regime snapshot per trading day. Computing a regime takes ~25
 * throttled Polygon calls (minutes), so a background job writes it once a day
 * and interactive pages read the latest row instead of recomputing.
 *
 * Returns are stored in basis points (invariant #4). `defaulted_fields` names
 * any indicator that fell back to a default because its data was unavailable,
 * so a partly-defaulted snapshot is never mistaken for live data.
 */
export const marketRegimes = pgTable('market_regimes', {
  id: uuid('id').primaryKey().defaultRandom(),
  asOfDate: date('as_of_date').notNull().unique(),                        // one snapshot per day
  regime: varchar('regime', { length: 20 }).notNull(),                     // bull | bear | high_vol | low_vol | rotation
  vixLevel: numeric('vix_level', { precision: 8, scale: 2 }).notNull(),     // index level, not a price
  sp500Return30dBps: integer('sp500_return_30d_bps').notNull(),
  sectorDispersionBps: integer('sector_dispersion_bps').notNull(),          // stddev of 11 sector ETF 30d returns
  defaultedFields: jsonb('defaulted_fields').$type<string[]>().default([]).notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});
