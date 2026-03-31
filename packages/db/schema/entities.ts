import { pgTable, uuid, varchar, text, timestamp, pgEnum, boolean, jsonb } from 'drizzle-orm/pg-core';

export const entityTypeEnum = pgEnum('entity_type', ['player', 'guide']);
export const brokerLinkStatusEnum = pgEnum('broker_link_status', ['none', 'pending', 'verified', 'failed']);

export const entities = pgTable('entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: varchar('clerk_user_id', { length: 255 }).unique(),    // null for ingested Guides
  type: entityTypeEnum('type').notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),          // URL-safe, unique
  bio: text('bio'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  styleTags: jsonb('style_tags').$type<string[]>().default([]),       // e.g. ['value', 'tech', 'macro']
  brokerLinkStatus: brokerLinkStatusEnum('broker_link_status').default('none'),
  isVerified: boolean('is_verified').default(false),
  isAllowlisted: boolean('is_allowlisted').default(false),            // for Guides
  sourceUrl: varchar('source_url', { length: 500 }),                  // Guide's public profile/blog
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),         // soft delete
});
