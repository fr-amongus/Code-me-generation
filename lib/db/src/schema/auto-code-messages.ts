import { createInsertSchema } from 'drizzle-zod';
import { index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';

import { autoCodeProposalsTable } from './auto-code-proposals';

export const autoCodeMessagesTable = pgTable(
  'auto_code_messages',
  {
    id: serial('id').primaryKey(),
    proposalId: integer('proposal_id')
      .notNull()
      .references(() => autoCodeProposalsTable.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('auto_code_messages_proposal_created_idx').on(table.proposalId, table.createdAt)],
);

export const insertAutoCodeMessageSchema = createInsertSchema(autoCodeMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAutoCodeMessage = z.infer<typeof insertAutoCodeMessageSchema>;
export type AutoCodeMessage = typeof autoCodeMessagesTable.$inferSelect;
