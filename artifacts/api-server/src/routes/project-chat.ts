import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  ListProjectMessagesParams,
  ListProjectMessagesResponse,
  SendProjectMessageBody,
  SendProjectMessageParams,
  SendProjectMessageResponse,
} from "@workspace/api-zod";
import { db, projectMessagesTable, projectsTable } from "@workspace/db";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();

const CHAT_SYSTEM_PROMPT = `
You are Code Me, an expert web application builder working inside an existing project.
Return ONLY one valid JSON object with exactly two string properties:
{
  "message": "A concise French explanation of what you changed",
  "html": "<!doctype html>...complete standalone application...</html>"
}
The html property must contain a complete self-contained HTML document with CSS in <style>
tags and JavaScript in <script> tags. Preserve the existing application's useful features,
then apply the user's requested change. The application must work offline without external
dependencies. Never return Markdown fences or text outside the JSON object.
`;

type Attachment = { name: string; type: string; content: string };

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: number; statusCode?: number; code?: number | string };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  if (candidate.code === 429 || candidate.code === "429") return 429;
  return undefined;
}

function cleanJson(value: string): string {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function cleanHtml(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function parseChatOutput(value: string): { message: string; html: string } | null {
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(cleanJson(trimmed)) as { message?: unknown; html?: unknown };
    if (typeof parsed.message === "string" && typeof parsed.html === "string") {
      return { message: parsed.message.trim(), html: cleanHtml(parsed.html) };
    }
  } catch {
    // Gemini occasionally follows the HTML-only format despite the JSON instruction.
  }

  const start = trimmed.search(/<!doctype html|<html[\s>]/i);
  const end = trimmed.toLowerCase().lastIndexOf("</html>");
  if (start >= 0 && end > start) {
    return {
      message: "J’ai appliqué la modification demandée au projet.",
      html: trimmed.slice(start, end + "</html>".length).trim(),
    };
  }
  return null;
}

function buildChatParts(
  projectHtml: string,
  conversation: string,
  message: string,
  attachments: Attachment[] | undefined,
) {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{
    text: [
      "Application HTML actuelle:",
      projectHtml || "(aucune application n'est encore générée)",
      "\nConversation précédente:",
      conversation || "(premier message)",
      "\nNouvelle demande de l'utilisateur:",
      message,
    ].join("\n\n"),
  }];
  for (const attachment of attachments ?? []) {
    if ((attachment.type.startsWith("image/") || attachment.type === "application/pdf") && attachment.content.startsWith("data:")) {
      const [, data = ""] = attachment.content.split(",", 2);
      parts.push({ inlineData: { mimeType: attachment.type, data } });
    } else {
      parts.push({ text: `\nAttached file: ${attachment.name} (${attachment.type})\n${attachment.content}` });
    }
  }
  return parts;
}

router.get("/projects/:projectId/messages", async (req, res): Promise<void> => {
  const params = ListProjectMessagesParams.safeParse(req.params);
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

  const messages = await db
    .select()
    .from(projectMessagesTable)
    .where(eq(projectMessagesTable.projectId, params.data.projectId))
    .orderBy(asc(projectMessagesTable.createdAt), asc(projectMessagesTable.id));

  res.json(ListProjectMessagesResponse.parse(messages));
});

router.post("/projects/:projectId/chat", async (req, res): Promise<void> => {
  const params = SendProjectMessageParams.safeParse(req.params);
  const body = SendProjectMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Écris une amélioration à apporter au projet." });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.projectId), eq(projectsTable.workspaceId, body.data.workspaceId)));
  if (!project) {
    res.status(404).json({ error: "Projet introuvable." });
    return;
  }

  const history = await db
    .select({ role: projectMessagesTable.role, content: projectMessagesTable.content })
    .from(projectMessagesTable)
    .where(eq(projectMessagesTable.projectId, project.id))
    .orderBy(asc(projectMessagesTable.createdAt), asc(projectMessagesTable.id))
    .limit(24);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    req.log.error("GEMINI_API_KEY is not configured");
    res.status(500).json({ error: "La génération IA n'est pas configurée sur le serveur." });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const conversation = history
      .map((entry) => `${entry.role === "user" ? "Utilisateur" : "Assistant"}: ${entry.content}`)
      .join("\n\n");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: buildChatParts(project.html ?? "", conversation, body.data.message, body.data.attachments) }],
      config: {
        systemInstruction: CHAT_SYSTEM_PROMPT,
        temperature: 0.25,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    });

    const output = parseChatOutput(response.text ?? "");
    const assistantText = output?.message ?? "";
    const html = output?.html ?? "";
    if (!assistantText || !html.toLowerCase().includes("<html")) {
      res.status(502).json({ error: "Le chat n'a pas renvoyé une amélioration exploitable." });
      return;
    }
    const storedUserMessage = body.data.attachments?.length
      ? `${body.data.message}\n\n[${body.data.attachments.length} pièce(s) jointe(s): ${body.data.attachments.map((attachment) => attachment.name).join(", ")}]`
      : body.data.message;

    const result = await db.transaction(async (tx) => {
      const [userMessage] = await tx
        .insert(projectMessagesTable)
        .values({ projectId: project.id, role: "user", content: storedUserMessage })
        .returning();
      const [updatedProject] = await tx
        .update(projectsTable)
        .set({ html, updatedAt: new Date() })
        .where(eq(projectsTable.id, project.id))
        .returning();
      const [assistantMessage] = await tx
        .insert(projectMessagesTable)
        .values({ projectId: project.id, role: "assistant", content: assistantText })
        .returning();
      return { project: updatedProject, userMessage, assistantMessage };
    });

    res.json(SendProjectMessageResponse.parse(result));
  } catch (error) {
    const status = getErrorStatus(error);
    const message = error instanceof Error ? error.message : "Unknown Gemini error";
    req.log.error({ err: error, status }, "Project chat generation failed");
    if (status === 429 || /rate.?limit|quota|too many requests|resource exhausted/i.test(message)) {
      res.status(429).json({ error: "Gemini est momentanément limité par son quota. Réessaie dans quelques secondes." });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: "Le chat n'a pas renvoyé une réponse exploitable. Réessaie." });
      return;
    }
    res.status(500).json({ error: "L'amélioration du projet a échoué. Réessaie." });
  }
});

export default router;