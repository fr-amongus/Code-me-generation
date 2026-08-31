import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, projectVersionsTable, projectsTable } from "@workspace/db";
import { scanProjectHtml } from "../lib/project-security";

const router: IRouter = Router();
const commandBody = z.object({ workspaceId: z.string().min(8).max(128), command: z.string().trim().min(1).max(500) });
const allowedCommands = ["help", "pwd", "ls", "cat index.html", "head index.html", "tail index.html", "wc -l index.html", "versions", "security scan"];

async function getProject(projectId: number, workspaceId: string) {
  const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.workspaceId, workspaceId)));
  return project;
}

router.post("/projects/:projectId/security-scan", async (req, res): Promise<void> => {
  const projectId = Number(req.params.projectId);
  const parsed = z.object({ workspaceId: z.string().min(8).max(128) }).safeParse(req.body);
  if (!Number.isInteger(projectId) || !parsed.success) { res.status(400).json({ error: "Projet ou workspace invalide." }); return; }
  const project = await getProject(projectId, parsed.data.workspaceId);
  if (!project) { res.status(404).json({ error: "Projet introuvable." }); return; }
  res.json(scanProjectHtml(project.html ?? ""));
});

router.post("/projects/:projectId/shell", async (req, res): Promise<void> => {
  const projectId = Number(req.params.projectId);
  const parsed = commandBody.safeParse(req.body);
  if (!Number.isInteger(projectId) || !parsed.success) { res.status(400).json({ error: "Commande ou workspace invalide." }); return; }
  const project = await getProject(projectId, parsed.data.workspaceId);
  if (!project) { res.status(404).json({ error: "Projet introuvable." }); return; }
  const command = parsed.data.command;
  let output = "";
  let exitCode = 0;
  if (command === "help") output = `Commandes disponibles:\n  pwd\n  ls\n  cat index.html\n  head index.html\n  tail index.html\n  wc -l index.html\n  versions\n  security scan`;
  else if (command === "pwd") output = `/workspace/${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  else if (command === "ls") output = `${project.html ? "index.html" : "(projet vide)"}\nREADME.md`;
  else if (command === "cat index.html") output = project.html ?? "(index.html n'existe pas encore)";
  else if (command === "head index.html") output = (project.html ?? "").split("\n").slice(0, 20).join("\n");
  else if (command === "tail index.html") output = (project.html ?? "").split("\n").slice(-20).join("\n");
  else if (command === "wc -l index.html") output = `${(project.html ?? "").split("\n").length} index.html`;
  else if (command === "security scan") {
    const report = scanProjectHtml(project.html ?? "");
    output = `Score sécurité: ${report.score}/100\n${Object.entries(report.summary).map(([level, count]) => `${level}: ${count}`).join("\n") || "Aucun risque détecté"}`;
  } else if (command === "versions") {
    const versions = await db.select({ id: projectVersionsTable.id, label: projectVersionsTable.label, createdAt: projectVersionsTable.createdAt }).from(projectVersionsTable).where(eq(projectVersionsTable.projectId, project.id)).orderBy(asc(projectVersionsTable.createdAt));
    output = versions.length ? versions.map((version) => `${version.id}  ${version.label}  ${version.createdAt.toISOString()}`).join("\n") : "Aucune version sauvegardée.";
  } else {
    exitCode = 127;
    output = `Commande refusée: ${command}\nUtilise "help" pour voir les commandes disponibles.`;
  }
  res.json({ command, output, exitCode, allowedCommands });
});

export default router;