import { pgTable, uuid, varchar, pgEnum, boolean } from 'drizzle-orm/pg-core';

export const assetClassEnum = pgEnum('asset_class', ['equity', 'etf', 'crypto', 'forex', 'commodity', 'index']);
export const exchangeEnum = pgEnum('exchange', ['NYSE', 'NASDAQ', 'AMEX']);

export const instruments = pgTable('instruments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  figi: varchar('figi', { length: 12 }),                             // OpenFIGI identifier
  isin: varchar('isin', { length: 12 }),
  name: varchar('name', { length: 255 }).notNull(),
  assetClass: assetClassEnum('asset_class').notNull().default('equity'),
  exchange: exchangeEnum('exchange'),
  sector: varchar('sector', { length: 100 }),
  industry: varchar('industry', { length: 100 }),
  marketCapBucket: varchar('market_cap_bucket', { length: 20 }),     // mega, large, mid, small, micro
  isActive: boolean('is_active').default(true),
});

// Unique constraint: ticker + exchange
// CREATE UNIQUE INDEX idx_instruments_ticker_exchange ON instruments(ticker, exchange);
