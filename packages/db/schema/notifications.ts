import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { entities } from './entities';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  // Types: new_follower, outcome_matured, rank_change, new_claim_from_follow, signal_trade_logged
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull().unique(),
  newFollower: boolean('new_follower').default(true).notNull(),
  outcomeMature: boolean('outcome_mature').default(true).notNull(),
  rankChange: boolean('rank_change').default(true).notNull(),
  newClaimFromFollow: boolean('new_claim_from_follow').default(true).notNull(),
  signalTradeLogged: boolean('signal_trade_logged').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
