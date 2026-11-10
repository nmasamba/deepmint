import { pgTable, uuid, varchar, integer, bigint, numeric, date, timestamp, unique } from 'drizzle-orm/pg-core';
import { claims } from './claims';
import { entities } from './entities';
import { instruments } from './instruments';
import { tradeSideEnum } from './playerTrades';

export const paperPortfolios = pgTable('paper_portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  startingBalanceCents: integer('starting_balance_cents').notNull().default(10000000), // $100,000
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paperTrades = pgTable('paper_trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id').references(() => paperPortfolios.id).notNull(),
  instrumentId: uuid('instrument_id').references(() => instruments.id).notNull(),
  claimId: uuid('claim_id').references(() => claims.id),              // the claim a mirror copied; null for a manual trade
  side: tradeSideEnum('side').notNull(),
  entryPriceCents: integer('entry_price_cents').notNull(),
  exitPriceCents: integer('exit_price_cents'),
  quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => [
  unique('paper_trades_claim_portfolio_unique').on(t.claimId, t.portfolioId), // one trade per mirrored claim per portfolio; also serves lookups by claim
]);

/**
 * A paper portfolio's equity at one session's close, written after the close
 * by the paper-equity-snapshot job (D19 option 2): cash plus open positions
 * marked at that session's closes. One row per portfolio per session; a rerun
 * writes nothing new.
 */
export const paperEquitySnapshots = pgTable('paper_equity_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id').references(() => paperPortfolios.id).notNull(),
  asOfDate: date('as_of_date').notNull(),                             // the session whose closes valued it
  equityCents: bigint('equity_cents', { mode: 'number' }).notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique('paper_equity_snapshots_portfolio_date_unique').on(t.portfolioId, t.asOfDate),
]);
