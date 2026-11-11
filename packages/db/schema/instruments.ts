import { pgTable, uuid, varchar, pgEnum, boolean } from 'drizzle-orm/pg-core';

export const assetClassEnum = pgEnum('asset_class', ['equity', 'etf', 'crypto', 'forex', 'commodity', 'index']);
// The asset classes that can be priced: pricing always calls Polygon's stocks
// endpoints, which serve shares and ETFs only. The admin API creates only
// these; the other enum values stay because dropping one needs a migration.
export const PRICEABLE_ASSET_CLASSES = ['equity', 'etf'] as const;
export const exchangeEnum = pgEnum('exchange', ['NYSE', 'NASDAQ', 'AMEX']);

export const instruments = pgTable('instruments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticker: varchar('ticker', { length: 20 }).notNull().unique(),
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
