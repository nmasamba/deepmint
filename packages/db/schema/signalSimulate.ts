import { pgTable, uuid, boolean, timestamp } from 'drizzle-orm/pg-core';
import { entities } from './entities';
import { paperPortfolios } from './paper';

// Links a follower to a followed entity via an auto-managed paper portfolio
export const signalSimulatePortfolios = pgTable('signal_simulate_portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),           // the follower
  followedEntityId: uuid('followed_entity_id').references(() => entities.id).notNull(), // who they mirror
  paperPortfolioId: uuid('paper_portfolio_id').references(() => paperPortfolios.id).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
