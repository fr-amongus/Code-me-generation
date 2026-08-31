import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

export const projectVersionsTable = pgTable("project_versions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  html: text("html").notNull(),
  label: text("label").notNull().default("Version sauvegardée"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});