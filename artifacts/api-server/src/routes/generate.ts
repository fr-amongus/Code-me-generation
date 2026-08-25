import { Router, type IRouter } from "express";
import { GenerateApplicationBody, GenerateApplicationResponse } from "@workspace/api-zod";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();

const SYSTEM_PROMPT = `
You are Code Me Generation, an expert autonomous web application builder.
Respond strictly and exclusively with valid, self-contained HTML code in one single file.
The file must include all required CSS inside <style> tags and all required JavaScript inside <script> tags.
Do not include Markdown, code fences, explanations, comments outside the HTML document, or any text before or after it.
Return only the complete HTML document beginning with <!doctype html> and ending with </html>.
The result must work offline in a browser without a build step or external dependencies.
Make the application polished, responsive, accessible, and fully interactive based on the user's request.
`;

type Attachment = { name: string; type: string; content: string };

function buildPromptParts(prompt: string, attachments: Attachment[] | undefined) {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: `Build this web application:\n\n${prompt}` }];
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

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    status?: number;
    statusCode?: number;
    code?: number | string;
  };

  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  if (candidate.code === 429 || candidate.code === "429") return 429;
  return undefined;
}

function cleanGeneratedHtml(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

router.post("/generate", async (req, res) => {
  const parsed = GenerateApplicationBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Décris une application avec au moins quelques mots." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    req.log.error("GEMINI_API_KEY is not configured");
    res.status(500).json({ error: "La génération IA n'est pas configurée sur le serveur." });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: buildPromptParts(parsed.data.prompt, parsed.data.attachments) }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.25,
        maxOutputTokens: 8192,
      },
    });

    const html = cleanGeneratedHtml(response.text ?? "");
    if (!html) {
      req.log.error("Gemini returned an empty application");
      res.status(502).json({ error: "Gemini n'a renvoyé aucun code exploitable. Réessaie avec une description plus précise." });
      return;
    }

    res.json(GenerateApplicationResponse.parse({ html }));
  } catch (error) {
    const status = getErrorStatus(error);
    const message = error instanceof Error ? error.message : "Unknown Gemini error";
    req.log.error({ err: error, status }, "Application generation failed");

    if (status === 429 || /rate.?limit|quota|too many requests|resource exhausted/i.test(message)) {
      res.status(429).json({ error: "Gemini est momentanément limité par son quota. Attends quelques secondes puis réessaie." });
      return;
    }

    res.status(500).json({ error: "La génération a échoué. Vérifie ta demande puis réessaie." });
  }
});

export default router;