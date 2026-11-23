import { adminAuditEventsTable, db } from '@workspace/db';

export async function recordAdminAuditEvent(input: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  details?: Record<string, string | number | boolean | null>;
}) {
  await db.insert(adminAuditEventsTable).values({
    actorUserId: input.actorUserId,
    action: input.action.slice(0, 48),
    targetType: input.targetType.slice(0, 48),
    targetId: input.targetId == null ? null : String(input.targetId).slice(0, 120),
    details: input.details ?? {},
  });
}
