import { createInsertSchema } from 'drizzle-zod';
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';

import { autoCodeMessagesTable } from './auto-code-messages';
import { autoCodeProposalsTable } from './auto-code-proposals';
import { usersTable } from './auth';

export const autoCodeUploadsTable = pgTable(
  'auto_code_uploads',
  {
    id: serial('id').primaryKey(),
    ownerUserId: varchar('owner_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    proposalId: integer('proposal_id').references(() => autoCodeProposalsTable.id, { onDelete: 'cascade' }),
    messageId: integer('message_id').references(() => autoCodeMessagesTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    contentType: varchar('content_type', { length: 120 }).notNull(),
    size: integer('size').notNull(),
    objectPath: varchar('object_path', { length: 500 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('auto_code_uploads_object_path_idx').on(table.objectPath),
    index('auto_code_uploads_owner_created_idx').on(table.ownerUserId, table.createdAt),
    index('auto_code_uploads_proposal_idx').on(table.proposalId),
  ],
);

export const insertAutoCodeUploadSchema = createInsertSchema(autoCodeUploadsTable).omit({
  id: true,
  createdAt: true,
  claimedAt: true,
});
export type InsertAutoCodeUpload = z.infer<typeof insertAutoCodeUploadSchema>;
export type AutoCodeUpload = typeof autoCodeUploadsTable.$inferSelect;
