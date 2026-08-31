export type GroqMessage = { role: "system" | "user"; content: string };

export class GroqRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "GroqRequestError";
  }
}

const GROQ_MODELS = [
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];

export async function callGroq(options: {
  apiKey: string;
  messages: GroqMessage[];
  maxTokens: number;
  json?: boolean;
}) {
  let lastError: GroqRequestError | undefined;
  for (const model of GROQ_MODELS) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: 0.2,
        max_tokens: options.maxTokens,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const body = await response.json().catch(() => ({})) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (!response.ok) {
      lastError = new GroqRequestError(response.status, body.error?.message ?? `Groq request failed with status ${response.status}`);
      if (response.status === 404 && /model|access/i.test(lastError.message)) continue;
      throw lastError;
    }
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new GroqRequestError(502, "Groq returned an empty response");
    return content;
  }
  throw lastError ?? new GroqRequestError(502, "No Groq model is available");
}
