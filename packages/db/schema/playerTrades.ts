import { pgTable, uuid, integer, numeric, timestamp, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { entities } from './entities';
import { instruments } from './instruments';

export const tradeSideEnum = pgEnum('trade_side', ['buy', 'sell']);

export const playerTrades = pgTable('player_trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  instrumentId: uuid('instrument_id').references(() => instruments.id).notNull(),
  side: tradeSideEnum('side').notNull(),
  entryPriceCents: integer('entry_price_cents').notNull(),
  exitPriceCents: integer('exit_price_cents'),                       // null if still open
  quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  isVerified: boolean('is_verified').default(false),                 // broker-verified
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
