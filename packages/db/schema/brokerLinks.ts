import { pgTable, uuid, varchar, timestamp, pgEnum, jsonb, boolean } from 'drizzle-orm/pg-core';
import { entities } from './entities';

export const brokerProviderEnum = pgEnum('broker_provider', ['snaptrade', 'plaid']);
export const brokerSyncStatusEnum = pgEnum('broker_sync_status', ['pending', 'active', 'error', 'disconnected']);

export const brokerLinks = pgTable('broker_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  provider: brokerProviderEnum('provider').notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  brokerName: varchar('broker_name', { length: 100 }),
  syncStatus: brokerSyncStatusEnum('sync_status').default('pending'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  syncErrorMessage: varchar('sync_error_message', { length: 500 }),
  isVerified: boolean('is_verified').default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
});
