import { createInsertSchema } from 'drizzle-zod';
import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';

import { autoCodeProposalsTable } from './auto-code-proposals';

export const autoCodeVersionsTable = pgTable(
  'auto_code_versions',
  {
    id: serial('id').primaryKey(),
    proposalId: integer('proposal_id')
      .notNull()
      .references(() => autoCodeProposalsTable.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshotPath: varchar('snapshot_path', { length: 500 }).notNull(),
    notesPath: varchar('notes_path', { length: 500 }).notNull(),
    previewPath: varchar('preview_path', { length: 500 }).notNull(),
    summary: text('summary').notNull(),
    changedFiles: jsonb('changed_files').$type<string[]>().notNull().default([]),
    addedFiles: jsonb('added_files').$type<string[]>().notNull().default([]),
    deletedFiles: jsonb('deleted_files').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('auto_code_versions_proposal_version_idx').on(table.proposalId, table.version),
    index('auto_code_versions_proposal_created_idx').on(table.proposalId, table.createdAt),
  ],
);

export const insertAutoCodeVersionSchema = createInsertSchema(autoCodeVersionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAutoCodeVersion = z.infer<typeof insertAutoCodeVersionSchema>;
export type AutoCodeVersion = typeof autoCodeVersionsTable.$inferSelect;
