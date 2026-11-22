import { createInsertSchema } from 'drizzle-zod';
import { index, integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';

import { usersTable } from './auth';

export const aiUsageEventsTable = pgTable(
  'ai_usage_events',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 24 }).notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    operation: varchar('operation', { length: 48 }).notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('ai_usage_events_user_created_idx').on(table.userId, table.createdAt),
    index('ai_usage_events_created_idx').on(table.createdAt),
  ],
);

export const insertAiUsageEventSchema = createInsertSchema(aiUsageEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAiUsageEvent = z.infer<typeof insertAiUsageEventSchema>;
export type AiUsageEvent = typeof aiUsageEventsTable.$inferSelect;
