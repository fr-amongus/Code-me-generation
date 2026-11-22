import { createInsertSchema } from 'drizzle-zod';
import { index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';

import { autoCodeProposalsTable } from './auto-code-proposals';
import { usersTable } from './auth';

export const autoCodeReviewsTable = pgTable(
  'auto_code_reviews',
  {
    id: serial('id').primaryKey(),
    proposalId: integer('proposal_id')
      .notNull()
      .references(() => autoCodeProposalsTable.id, { onDelete: 'cascade' }),
    actorUserId: varchar('actor_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    decision: varchar('decision', { length: 24 }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('auto_code_reviews_proposal_created_idx').on(table.proposalId, table.createdAt)],
);

export const insertAutoCodeReviewSchema = createInsertSchema(autoCodeReviewsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAutoCodeReview = z.infer<typeof insertAutoCodeReviewSchema>;
export type AutoCodeReview = typeof autoCodeReviewsTable.$inferSelect;
