import { pgTable, uuid, varchar, integer, numeric, timestamp } from 'drizzle-orm/pg-core';
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
  side: tradeSideEnum('side').notNull(),
  entryPriceCents: integer('entry_price_cents').notNull(),
  exitPriceCents: integer('exit_price_cents'),
  quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});
