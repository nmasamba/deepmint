import { pgTable, uuid, boolean, varchar, timestamp } from 'drizzle-orm/pg-core';
import { entities } from './entities';

export const emailPreferences = pgTable('email_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull().unique(),
  digestEnabled: boolean('digest_enabled').notNull().default(true),
  digestFrequency: varchar('digest_frequency', { length: 10 }).notNull().default('daily'), // 'daily' | 'weekly'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
