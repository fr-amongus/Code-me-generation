import { db, aiUsageEventsTable } from '@workspace/db';

export type AiUsageEventInput = {
  userId?: string | null;
  provider: string;
  model: string;
  operation: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

function cleanTokenCount(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export async function recordAiUsage(event: AiUsageEventInput) {
  if (!event.userId) return;
  await db.insert(aiUsageEventsTable).values({
    userId: event.userId,
    provider: event.provider.slice(0, 24),
    model: event.model.slice(0, 120),
    operation: event.operation.slice(0, 48),
    inputTokens: cleanTokenCount(event.inputTokens),
    outputTokens: cleanTokenCount(event.outputTokens),
    totalTokens: cleanTokenCount(event.totalTokens),
  });
}
