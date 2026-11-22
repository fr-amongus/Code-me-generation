import { createInsertSchema } from 'drizzle-zod';
import { index, jsonb, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';

import { usersTable } from './auth';

export const adminAuditEventsTable = pgTable(
  'admin_audit_events',
  {
    id: serial('id').primaryKey(),
    actorUserId: varchar('actor_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 48 }).notNull(),
    targetType: varchar('target_type', { length: 48 }).notNull(),
    targetId: varchar('target_id', { length: 120 }),
    details: jsonb('details').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('admin_audit_events_actor_created_idx').on(table.actorUserId, table.createdAt)],
);

export const insertAdminAuditEventSchema = createInsertSchema(adminAuditEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminAuditEvent = z.infer<typeof insertAdminAuditEventSchema>;
export type AdminAuditEvent = typeof adminAuditEventsTable.$inferSelect;
