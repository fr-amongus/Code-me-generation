import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  CreateProjectBody,
  CreateProjectResponse,
  DeleteProjectBody,
  DeleteProjectParams,
  ListProjectsQueryParams,
  ListProjectsResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
} from "@workspace/api-zod";
import { db, projectsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const parsed = ListProjectsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Workspace invalide." });
    return;
  }

  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.workspaceId, parsed.data.workspaceId))
    .orderBy(desc(projectsTable.updatedAt), asc(projectsTable.id));

  res.json(ListProjectsResponse.parse(projects));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Les informations du projet sont invalides." });
    return;
  }

  const [project] = await db
    .insert(projectsTable)
    .values({
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      prompt: parsed.data.prompt ?? "",
      html: parsed.data.html ?? null,
    })
    .returning();

  res.status(201).json(CreateProjectResponse.parse(project));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  const body = UpdateProjectBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Les informations du projet sont invalides." });
    return;
  }

  const [project] = await db
    .update(projectsTable)
    .set({
      ...(body.data.name === undefined ? {} : { name: body.data.name }),
      ...(body.data.prompt === undefined ? {} : { prompt: body.data.prompt }),
      ...(body.data.html === undefined ? {} : { html: body.data.html }),
      updatedAt: new Date(),
    })
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.workspaceId, body.data.workspaceId)))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Projet introuvable." });
    return;
  }

  res.json(UpdateProjectResponse.parse(project));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  const body = DeleteProjectBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Projet ou workspace invalide." });
    return;
  }

  const [project] = await db
    .delete(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.workspaceId, body.data.workspaceId)))
    .returning({ id: projectsTable.id });

  if (!project) {
    res.status(404).json({ error: "Projet introuvable." });
    return;
  }

  res.sendStatus(204);
});

export default router;