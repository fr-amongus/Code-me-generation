import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const projectSecretsTable = pgTable(
  "project_secrets",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    projectSecretNameUnique: uniqueIndex("project_secrets_project_name_key_unique").on(
      table.projectId,
      table.nameKey,
    ),
  }),
);

export const insertProjectSecretSchema = createInsertSchema(projectSecretsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectSecret = z.infer<typeof insertProjectSecretSchema>;
export type ProjectSecret = typeof projectSecretsTable.$inferSelect;
