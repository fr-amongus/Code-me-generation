import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { ListProjectMemoryFilesParams, ListProjectMemoryFilesResponse } from "@workspace/api-zod";
import { db, projectMemoryFilesTable, projectsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();
router.use("/projects", requireAuth);

router.get("/projects/:projectId/memory", async (req, res): Promise<void> => {
  const params = ListProjectMemoryFilesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Projet invalide." });
    return;
  }
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Connectez-vous pour accéder à ce projet." });
    return;
  }

  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.projectId), eq(projectsTable.workspaceId, req.user.id)));
  if (!project) {
    res.status(404).json({ error: "Projet introuvable." });
    return;
  }

  const files = await db
    .select()
    .from(projectMemoryFilesTable)
    .where(eq(projectMemoryFilesTable.projectId, project.id))
    .orderBy(asc(projectMemoryFilesTable.name), asc(projectMemoryFilesTable.id));

  res.json(ListProjectMemoryFilesResponse.parse(files));
});

export default router;