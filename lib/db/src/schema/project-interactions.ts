import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { projectMessagesTable } from "./project-messages";
import { projectsTable } from "./projects";

export const projectInteractionKindEnum = pgEnum("project_interaction_kind", [
  "question",
  "proposal",
  "secret",
]);

export const projectInteractionAnswerModeEnum = pgEnum("project_interaction_answer_mode", [
  "single_choice",
  "multiple_choice",
  "text",
  "secret",
]);

export const projectInteractionStatusEnum = pgEnum("project_interaction_status", [
  "waiting",
  "processing",
  "answered",
  "cancelled",
]);

export type ProjectInteractionOption = {
  id: string;
  label: string;
  value: string;
};

export type ProjectInteractionAnswer = {
  choiceIds?: string[];
  text?: string;
  secretId?: number;
  secretName?: string;
  saved?: boolean;
};

export const projectInteractionsTable = pgTable(
  "project_interactions",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    assistantMessageId: integer("assistant_message_id")
      .notNull()
      .references(() => projectMessagesTable.id, { onDelete: "cascade" }),
    kind: projectInteractionKindEnum("kind").notNull(),
    answerMode: projectInteractionAnswerModeEnum("answer_mode").notNull(),
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<ProjectInteractionOption[]>().notNull().default([]),
    secretName: text("secret_name"),
    status: projectInteractionStatusEnum("status").notNull().default("waiting"),
    answer: jsonb("answer").$type<ProjectInteractionAnswer>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => ({
    oneActiveInteractionPerProject: uniqueIndex("project_interactions_one_active_per_project")
      .on(table.projectId)
      .where(sql`${table.status} in ('waiting', 'processing')`),
  }),
);

export const insertProjectInteractionSchema = createInsertSchema(projectInteractionsTable).omit({
  id: true,
  createdAt: true,
  answeredAt: true,
});

export type InsertProjectInteraction = z.infer<typeof insertProjectInteractionSchema>;
export type ProjectInteraction = typeof projectInteractionsTable.$inferSelect;
