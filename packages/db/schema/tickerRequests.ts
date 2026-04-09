import { pgTable, uuid, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { entities } from './entities';

export const tickerRequestStatusEnum = pgEnum('ticker_request_status', ['pending', 'approved', 'rejected']);

export const tickerRequests = pgTable('ticker_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  reason: text('reason'),
  status: tickerRequestStatusEnum('status').notNull().default('pending'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => entities.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
