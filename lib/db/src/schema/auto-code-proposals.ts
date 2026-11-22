import { createInsertSchema } from 'drizzle-zod';
import { index, integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';

import { usersTable } from './auth';

export const autoCodeProposalsTable = pgTable(
  'auto_code_proposals',
  {
    id: serial('id').primaryKey(),
    ownerUserId: varchar('owner_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 140 }).notNull().default('Nouvelle proposition'),
    status: varchar('status', { length: 24 }).notNull().default('draft'),
    latestVersion: integer('latest_version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: varchar('reviewed_by').references(() => usersTable.id, { onDelete: 'set null' }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    appliedBy: varchar('applied_by').references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('auto_code_proposals_owner_updated_idx').on(table.ownerUserId, table.updatedAt),
    index('auto_code_proposals_status_updated_idx').on(table.status, table.updatedAt),
  ],
);

export const insertAutoCodeProposalSchema = createInsertSchema(autoCodeProposalsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedBy: true,
  appliedAt: true,
  appliedBy: true,
});
export type InsertAutoCodeProposal = z.infer<typeof insertAutoCodeProposalSchema>;
export type AutoCodeProposal = typeof autoCodeProposalsTable.$inferSelect;
