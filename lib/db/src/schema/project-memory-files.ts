import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const projectMemoryFilesTable = pgTable("project_memory_files", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  projectMemoryNameUnique: uniqueIndex("project_memory_files_project_name_unique").on(table.projectId, table.name),
}));

export const insertProjectMemoryFileSchema = createInsertSchema(projectMemoryFilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectMemoryFile = z.infer<typeof insertProjectMemoryFileSchema>;
export type ProjectMemoryFile = typeof projectMemoryFilesTable.$inferSelect;