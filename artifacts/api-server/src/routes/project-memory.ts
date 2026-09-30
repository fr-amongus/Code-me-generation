import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { ListProjectMemoryFilesParams, ListProjectMemoryFilesResponse } from "@workspace/api-zod";
import { db, projectMemoryFilesTable, projectsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/projects/:projectId/memory", async (req, res): Promise<void> => {
  const params = ListProjectMemoryFilesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Projet invalide." });
    return;
  }

  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId));
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