import { createInsertSchema } from 'drizzle-zod';
import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';

import { usersTable } from './auth';

export const featureReleasesTable = pgTable('feature_releases', {
  key: varchar('key', { length: 80 }).primaryKey(),
  audience: varchar('audience', { length: 16 }).notNull(),
  updatedBy: varchar('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertFeatureReleaseSchema = createInsertSchema(featureReleasesTable);
export type InsertFeatureRelease = z.infer<typeof insertFeatureReleaseSchema>;
export type FeatureRelease = typeof featureReleasesTable.$inferSelect;
