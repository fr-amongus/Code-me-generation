import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, projectVersionsTable, projectsTable } from "@workspace/db";

const router: IRouter = Router();
const workspaceBody = z.object({ workspaceId: z.string().min(8).max(128) });

router.get("/projects/:projectId/versions", async (req, res): Promise<void> => {
  const projectId = Number(req.params.projectId);
  const workspaceId = String(req.query.workspaceId ?? "");
  if (!Number.isInteger(projectId) || !workspaceBody.safeParse({ workspaceId }).success) {
    res.status(400).json({ error: "Projet ou workspace invalide." });
    return;
  }
  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.workspaceId, workspaceId)));
  if (!project) { res.status(404).json({ error: "Projet introuvable." }); return; }
  res.json(await db.select().from(projectVersionsTable)
    .where(eq(projectVersionsTable.projectId, projectId)).orderBy(asc(projectVersionsTable.createdAt)));
});

router.post("/projects/:projectId/versions", async (req, res): Promise<void> => {
  const projectId = Number(req.params.projectId);
  const parsed = workspaceBody.extend({ html: z.string().min(1).max(2_000_000), label: z.string().max(120).optional() }).safeParse(req.body);
  if (!Number.isInteger(projectId) || !parsed.success) { res.status(400).json({ error: "Version invalide." }); return; }
  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.workspaceId, parsed.data.workspaceId)));
  if (!project) { res.status(404).json({ error: "Projet introuvable." }); return; }
  const [version] = await db.insert(projectVersionsTable).values({ projectId, html: parsed.data.html, label: parsed.data.label ?? "Version sauvegardée" }).returning();
  res.status(201).json(version);
});

router.post("/projects/:projectId/versions/:versionId/restore", async (req, res): Promise<void> => {
  const projectId = Number(req.params.projectId);
  const versionId = Number(req.params.versionId);
  const parsed = workspaceBody.safeParse(req.body);
  if (!Number.isInteger(projectId) || !Number.isInteger(versionId) || !parsed.success) { res.status(400).json({ error: "Restauration invalide." }); return; }
  const [version] = await db.select().from(projectVersionsTable).where(and(eq(projectVersionsTable.id, versionId), eq(projectVersionsTable.projectId, projectId)));
  const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.workspaceId, parsed.data.workspaceId)));
  if (!version || !project) { res.status(404).json({ error: "Version ou projet introuvable." }); return; }
  const [updated] = await db.update(projectsTable).set({ html: version.html, updatedAt: new Date() }).where(eq(projectsTable.id, projectId)).returning();
  res.json(updated);
});

export default router;