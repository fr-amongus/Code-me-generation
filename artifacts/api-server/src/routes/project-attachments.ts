import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, projectAttachmentsTable, projectsTable } from "@workspace/db";

const router: IRouter = Router();
const workspace = z.object({ workspaceId: z.string().min(8).max(128) });
const attachment = workspace.extend({
  name: z.string().min(1).max(200),
  type: z.string().max(120),
  size: z.number().int().positive(),
  objectPath: z.string().min(1).max(500),
});

router.get("/projects/:projectId/attachments", async (req, res): Promise<void> => {
  const projectId = Number(req.params.projectId);
  const workspaceId = String(req.query.workspaceId ?? "");
  if (!Number.isInteger(projectId) || !workspace.safeParse({ workspaceId }).success) { res.status(400).json({ error: "Projet ou workspace invalide." }); return; }
  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.workspaceId, workspaceId)));
  if (!project) { res.status(404).json({ error: "Projet introuvable." }); return; }
  res.json(await db.select().from(projectAttachmentsTable).where(eq(projectAttachmentsTable.projectId, projectId)).orderBy(asc(projectAttachmentsTable.createdAt)));
});

router.post("/projects/:projectId/attachments", async (req, res): Promise<void> => {
  const projectId = Number(req.params.projectId);
  const parsed = attachment.safeParse(req.body);
  if (!Number.isInteger(projectId) || !parsed.success) { res.status(400).json({ error: "Pièce jointe invalide." }); return; }
  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.workspaceId, parsed.data.workspaceId)));
  if (!project) { res.status(404).json({ error: "Projet introuvable." }); return; }
  const [saved] = await db.insert(projectAttachmentsTable).values({
    projectId, name: parsed.data.name, type: parsed.data.type, size: parsed.data.size, objectPath: parsed.data.objectPath,
  }).returning();
  res.status(201).json(saved);
});

export default router;