import { pgTable, uuid, varchar, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entities } from './entities';

export const guideApplicationStatusEnum = pgEnum('guide_application_status', ['pending', 'approved', 'rejected']);

/**
 * A user's request to become a Guide (D16 option 2). An admin approves it,
 * which makes the applicant's own entity a Guide or links the applicant's
 * account to the Guide Deepmint already ingested for them, or rejects it.
 * After a link, the applicant's old Player entity (entity_id) stays as the
 * record of the claims it made, and linked_guide_id is the Guide that is now
 * their account.
 */
export const guideApplications = pgTable('guide_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),       // the applicant
  pitch: text('pitch').notNull(),                                            // who they are and what they publish
  sourceUrl: varchar('source_url', { length: 500 }),                         // their public profile, blog or feed
  claimedGuideId: uuid('claimed_guide_id').references(() => entities.id),    // an ingested Guide they say is them
  linkedGuideId: uuid('linked_guide_id').references(() => entities.id),      // set when approval linked them to it
  status: guideApplicationStatusEnum('status').notNull().default('pending'),
  reviewNote: text('review_note'),
  reviewedBy: uuid('reviewed_by').references(() => entities.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // One open application per applicant.
  uniqueIndex('guide_applications_one_pending').on(t.entityId).where(sql`${t.status} = 'pending'`),
]);
