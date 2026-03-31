import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { entities } from './entities';
import { instruments } from './instruments';

export const follows = pgTable('follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  followerId: uuid('follower_id').references(() => entities.id).notNull(),
  followedId: uuid('followed_id').references(() => entities.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const watchlists = pgTable('watchlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  instrumentId: uuid('instrument_id').references(() => instruments.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
