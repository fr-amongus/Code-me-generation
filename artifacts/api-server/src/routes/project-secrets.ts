import { Router, type IRouter, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  CreateProjectSecretBody,
  CreateProjectSecretParams,
  CreateProjectSecretResponse,
  DeleteProjectSecretParams,
  DeleteProjectSecretResponse,
  ListProjectSecretsParams,
  ListProjectSecretsResponse,
  RevealProjectSecretParams,
  RevealProjectSecretResponse,
  UpdateProjectSecretBody,
  UpdateProjectSecretParams,
  UpdateProjectSecretResponse,
} from "@workspace/api-zod";
import { db, projectSecretsTable, projectsTable } from "@workspace/db";
import { decryptSecretValue, encryptSecretValue, SecretVaultConfigurationError } from "../lib/secret-vault";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();
router.use("/projects", requireAuth);

const secretNamePattern = /^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/;

function isUniqueViolation(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  if ("cause" in error && error.cause !== error) return isUniqueViolation(error.cause);
  return false;
}

function secretVaultUnavailable(res: Response) {
  res.status(503).json({ error: "Le coffre de secrets n’est pas encore configuré sur le serveur." });
}

function secretNameInvalid(res: Response) {
  res.status(400).json({ error: "Le nom doit commencer par une lettre ou un souligné et ne contenir que lettres, chiffres, points, tirets ou soulignés." });
}

async function projectOwnedBy(projectId: number, userId: string) {
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.workspaceId, userId)));
  return project?.id ?? null;
}

function publicSecret(secret: { id: number; projectId: number; name: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: secret.id,
    projectId: secret.projectId,
    name: secret.name,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  };
}

router.get("/projects/:projectId/secrets", async (req, res): Promise<void> => {
  const params = ListProjectSecretsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Projet invalide." });
    return;
  }
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Connectez-vous pour accéder au coffre." });
    return;
  }
  const projectId = await projectOwnedBy(params.data.projectId, req.user.id);
  if (!projectId) {
    res.status(404).json({ error: "Projet introuvable." });
    return;
  }

  const secrets = await db
    .select({
      id: projectSecretsTable.id,
      projectId: projectSecretsTable.projectId,
      name: projectSecretsTable.name,
      createdAt: projectSecretsTable.createdAt,
      updatedAt: projectSecretsTable.updatedAt,
    })
    .from(projectSecretsTable)
    .where(eq(projectSecretsTable.projectId, projectId))
    .orderBy(projectSecretsTable.name);
  res.json(ListProjectSecretsResponse.parse(secrets));
});

router.post("/projects/:projectId/secrets", async (req, res): Promise<void> => {
  const params = CreateProjectSecretParams.safeParse(req.params);
  const body = CreateProjectSecretBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Le nom ou la valeur du secret est invalide." });
    return;
  }
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Connectez-vous pour modifier le coffre." });
    return;
  }
  const projectId = await projectOwnedBy(params.data.projectId, req.user.id);
  if (!projectId) {
    res.status(404).json({ error: "Projet introuvable." });
    return;
  }

  const name = body.data.name.trim();
  if (!secretNamePattern.test(name)) {
    secretNameInvalid(res);
    return;
  }

  try {
    const encrypted = encryptSecretValue(body.data.value);
    const [secret] = await db
      .insert(projectSecretsTable)
      .values({
        projectId,
        name,
        nameKey: name.toLowerCase(),
        ...encrypted,
      })
      .returning({
        id: projectSecretsTable.id,
        projectId: projectSecretsTable.projectId,
        name: projectSecretsTable.name,
        createdAt: projectSecretsTable.createdAt,
        updatedAt: projectSecretsTable.updatedAt,
      });
    res.status(201).json(CreateProjectSecretResponse.parse(publicSecret(secret)));
  } catch (error) {
    if (error instanceof SecretVaultConfigurationError) {
      secretVaultUnavailable(res);
      return;
    }
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Un secret porte déjà ce nom dans ce projet." });
      return;
    }
    throw error;
  }
});

router.patch("/projects/:projectId/secrets/:secretId", async (req, res): Promise<void> => {
  const params = UpdateProjectSecretParams.safeParse(req.params);
  const body = UpdateProjectSecretBody.safeParse(req.body);
  if (!params.success || !body.success || (!body.data.name && !body.data.value)) {
    res.status(400).json({ error: "Indique un nouveau nom ou une nouvelle valeur." });
    return;
  }
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Connectez-vous pour modifier le coffre." });
    return;
  }
  const projectId = await projectOwnedBy(params.data.projectId, req.user.id);
  if (!projectId) {
    res.status(404).json({ error: "Projet introuvable." });
    return;
  }

  const updates: Partial<typeof projectSecretsTable.$inferInsert> = {};
  if (body.data.name !== undefined) {
    const name = body.data.name.trim();
    if (!secretNamePattern.test(name)) {
      secretNameInvalid(res);
      return;
    }
    updates.name = name;
    updates.nameKey = name.toLowerCase();
  }
  try {
    if (body.data.value !== undefined) Object.assign(updates, encryptSecretValue(body.data.value));
    const [secret] = await db
      .update(projectSecretsTable)
      .set(updates)
      .where(and(eq(projectSecretsTable.id, params.data.secretId), eq(projectSecretsTable.projectId, projectId)))
      .returning({
        id: projectSecretsTable.id,
        projectId: projectSecretsTable.projectId,
        name: projectSecretsTable.name,
        createdAt: projectSecretsTable.createdAt,
        updatedAt: projectSecretsTable.updatedAt,
      });
    if (!secret) {
      res.status(404).json({ error: "Secret introuvable." });
      return;
    }
    res.json(UpdateProjectSecretResponse.parse(publicSecret(secret)));
  } catch (error) {
    if (error instanceof SecretVaultConfigurationError) {
      secretVaultUnavailable(res);
      return;
    }
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Un secret porte déjà ce nom dans ce projet." });
      return;
    }
    throw error;
  }
});

router.delete("/projects/:projectId/secrets/:secretId", async (req, res): Promise<void> => {
  const params = DeleteProjectSecretParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Projet ou secret invalide." });
    return;
  }
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Connectez-vous pour modifier le coffre." });
    return;
  }
  const projectId = await projectOwnedBy(params.data.projectId, req.user.id);
  if (!projectId) {
    res.status(404).json({ error: "Projet introuvable." });
    return;
  }
  const [deleted] = await db
    .delete(projectSecretsTable)
    .where(and(eq(projectSecretsTable.id, params.data.secretId), eq(projectSecretsTable.projectId, projectId)))
    .returning({ id: projectSecretsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Secret introuvable." });
    return;
  }
  res.json(DeleteProjectSecretResponse.parse({ success: true }));
});

router.post("/projects/:projectId/secrets/:secretId/reveal", async (req, res): Promise<void> => {
  const params = RevealProjectSecretParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Projet ou secret invalide." });
    return;
  }
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Connectez-vous pour afficher ce secret." });
    return;
  }
  const projectId = await projectOwnedBy(params.data.projectId, req.user.id);
  if (!projectId) {
    res.status(404).json({ error: "Projet introuvable." });
    return;
  }
  const [secret] = await db
    .select()
    .from(projectSecretsTable)
    .where(and(eq(projectSecretsTable.id, params.data.secretId), eq(projectSecretsTable.projectId, projectId)));
  if (!secret) {
    res.status(404).json({ error: "Secret introuvable." });
    return;
  }
  try {
    res.json(RevealProjectSecretResponse.parse({
      name: secret.name,
      value: decryptSecretValue(secret),
    }));
  } catch (error) {
    if (error instanceof SecretVaultConfigurationError) {
      secretVaultUnavailable(res);
      return;
    }
    res.status(500).json({ error: "Impossible de déchiffrer ce secret. Vérifie que la clé maîtresse du coffre n’a pas changé." });
  }
});

export default router;
