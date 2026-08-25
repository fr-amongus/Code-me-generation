import { createInsertSchema } from "drizzle-zod";
import { integer, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const projectMessageRoleEnum = pgEnum("project_message_role", ["user", "assistant"]);

export const projectMessagesTable = pgTable("project_messages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  role: projectMessageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectMessageSchema = createInsertSchema(projectMessagesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertProjectMessage = z.infer<typeof insertProjectMessageSchema>;
export type ProjectMessage = typeof projectMessagesTable.$inferSelect;