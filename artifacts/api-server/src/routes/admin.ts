import { createHash, timingSafeEqual } from 'node:crypto';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';
import {
  ClaimOwnerAdminBody,
  ClaimOwnerAdminResponse,
  GetAdminAccessResponse,
  GetAdminDashboardResponse,
  GetAdminDashboardQueryParams,
  ListAdminFeaturesResponse,
  ListAvailableFeaturesResponse,
  UpdateAdminFeatureBody,
  UpdateAdminFeatureParams,
  UpdateAdminFeatureResponse,
} from '@workspace/api-zod';
import {
  adminAuditEventsTable,
  aiUsageEventsTable,
  db,
  featureReleasesTable,
  usersTable,
} from '@workspace/db';
import { requireAuth, requireOwnerAdmin } from '../middlewares/authMiddleware';
import { recordAdminAuditEvent } from '../lib/admin-audit';
import { FEATURE_DEFINITIONS, getFeatureAudience, userCanAccessFeature } from '../lib/features';

const router: IRouter = Router();
const bootstrapAttempts = new Map<string, { count: number; windowStart: number }>();
const MAX_BOOTSTRAP_ATTEMPTS = 5;
const BOOTSTRAP_WINDOW_MS = 15 * 60 * 1000;

function bootstrapAttemptAllowed(userId: string) {
  const now = Date.now();
  const current = bootstrapAttempts.get(userId);
  if (!current || now - current.windowStart >= BOOTSTRAP_WINDOW_MS) {
    bootstrapAttempts.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (current.count >= MAX_BOOTSTRAP_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

function tokenMatches(provided: string, expected: string) {
  const providedHash = createHash('sha256').update(provided, 'utf8').digest();
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(providedHash, expectedHash);
}

router.get('/admin/access', requireAuth, async (req, res) => {
  const [currentUser] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id))
    .limit(1);
  const [owner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, 'owner'))
    .limit(1);

  res.json(GetAdminAccessResponse.parse({
    isOwnerAdmin: currentUser?.role === 'owner',
    bootstrapAvailable: !owner && Boolean(process.env.CODE_ME_ADMIN_BOOTSTRAP_TOKEN),
  }));
});

router.post('/admin/bootstrap/claim', requireAuth, async (req, res) => {
  const parsed = ClaimOwnerAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Le code de configuration est invalide.' });
    return;
  }
  const expectedToken = process.env.CODE_ME_ADMIN_BOOTSTRAP_TOKEN;
  if (!expectedToken) {
    res.status(409).json({ error: 'La configuration initiale du propriétaire est désactivée.' });
    return;
  }
  if (!bootstrapAttemptAllowed(req.user!.id)) {
    res.status(429).json({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' });
    return;
  }
  if (!tokenMatches(parsed.data.token, expectedToken)) {
    res.status(401).json({ error: 'Le code de configuration est incorrect.' });
    return;
  }

  try {
    await db.transaction(async (transaction) => {
      const [owner] = await transaction
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.role, 'owner'))
        .limit(1);
      if (owner) throw Object.assign(new Error('Owner already claimed'), { code: 'OWNER_EXISTS' });

      const [updatedUser] = await transaction
        .update(usersTable)
        .set({ role: 'owner' })
        .where(eq(usersTable.id, req.user!.id))
        .returning({ id: usersTable.id });
      if (!updatedUser) throw new Error('Authenticated user no longer exists');

      await transaction.insert(adminAuditEventsTable).values({
        actorUserId: req.user!.id,
        action: 'owner_bootstrap_claimed',
        targetType: 'user',
        targetId: req.user!.id,
        details: {},
      });
    });
    bootstrapAttempts.delete(req.user!.id);
    res.json(ClaimOwnerAdminResponse.parse({ isOwnerAdmin: true, bootstrapAvailable: false }));
  } catch (error) {
    const candidate = error as { code?: string; cause?: { code?: string } };
    const code = candidate.code ?? candidate.cause?.code;
    if (code === 'OWNER_EXISTS' || code === '23505') {
      res.status(409).json({ error: 'Un propriétaire administrateur a déjà été configuré.' });
      return;
    }
    req.log.error({ err: error }, 'Owner bootstrap failed');
    res.status(500).json({ error: 'La configuration du compte administrateur a échoué.' });
  }
});

router.get('/admin/dashboard', requireOwnerAdmin, async (req, res) => {
  const parsed = GetAdminDashboardQueryParams.safeParse(req.query);
  const period = parsed.success ? parsed.data.period ?? '30d' : '30d';
  if (!parsed.success) {
    res.status(400).json({ error: 'La période demandée est invalide.' });
    return;
  }
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [users, usageRows] = await Promise.all([
    db
      .select({ id: usersTable.id, username: usersTable.username, createdAt: usersTable.createdAt })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt)),
    db
      .select({
        userId: aiUsageEventsTable.userId,
        calls: sql<number>`count(*)::int`,
        tokenCount: sql<number>`coalesce(sum(${aiUsageEventsTable.totalTokens}), 0)::int`,
        tokenCalls: sql<number>`count(${aiUsageEventsTable.totalTokens})::int`,
      })
      .from(aiUsageEventsTable)
      .where(gte(aiUsageEventsTable.createdAt, since))
      .groupBy(aiUsageEventsTable.userId),
  ]);

  const usageByUser = new Map(usageRows.map((row) => [
    row.userId,
    {
      calls: Number(row.calls) || 0,
      tokenCount: Number(row.tokenCount) || 0,
      tokenCalls: Number(row.tokenCalls) || 0,
    },
  ]));
  const trackedCalls = usageRows.reduce((sum, row) => sum + (Number(row.calls) || 0), 0);
  const reportedTokens = usageRows.reduce((sum, row) => sum + (Number(row.tokenCount) || 0), 0);
  const tokenReportedCalls = usageRows.reduce((sum, row) => sum + (Number(row.tokenCalls) || 0), 0);

  const response = {
    period,
    totalUsers: users.length,
    trackedCalls,
    tokenReportedCalls,
    reportedTokens,
    users: users.map((user) => {
      const usage = usageByUser.get(user.id) ?? { calls: 0, tokenCount: 0, tokenCalls: 0 };
      return {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        calls: usage.calls,
        callSharePercent: trackedCalls ? Number(((usage.calls / trackedCalls) * 100).toFixed(2)) : 0,
        tokenCount: usage.tokenCount,
        tokenCallCount: usage.tokenCalls,
        tokenSharePercent: reportedTokens ? Number(((usage.tokenCount / reportedTokens) * 100).toFixed(2)) : 0,
      };
    }),
  };
  res.json(GetAdminDashboardResponse.parse(response));
});

async function getFeatureReleaseList() {
  const rows = await db.select().from(featureReleasesTable);
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  return {
    features: await Promise.all(FEATURE_DEFINITIONS.map(async (feature) => {
      const row = rowByKey.get(feature.key);
      return {
        key: feature.key,
        label: feature.label,
        audience: await getFeatureAudience(feature.key),
        defaultAudience: feature.defaultAudience,
        updatedAt: row?.updatedAt ?? null,
      };
    })),
  };
}

router.get('/admin/features', requireOwnerAdmin, async (_req, res) => {
  res.json(ListAdminFeaturesResponse.parse(await getFeatureReleaseList()));
});

router.patch('/admin/features/:key', requireOwnerAdmin, async (req, res) => {
  const params = UpdateAdminFeatureParams.safeParse(req.params);
  const body = UpdateAdminFeatureBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: 'Le paramètre de publication est invalide.' });
    return;
  }
  const definition = FEATURE_DEFINITIONS.find((feature) => feature.key === params.data.key);
  if (!definition || definition.key === 'admin-dashboard') {
    res.status(400).json({ error: 'Cette fonctionnalité ne peut pas être publiée ici.' });
    return;
  }

  const [row] = await db
    .insert(featureReleasesTable)
    .values({ key: definition.key, audience: body.data.audience, updatedBy: req.user!.id })
    .onConflictDoUpdate({
      target: featureReleasesTable.key,
      set: { audience: body.data.audience, updatedBy: req.user!.id, updatedAt: new Date() },
    })
    .returning();
  await recordAdminAuditEvent({
    actorUserId: req.user!.id,
    action: 'feature_audience_updated',
    targetType: 'feature',
    targetId: definition.key,
    details: { audience: body.data.audience },
  });
  res.json(UpdateAdminFeatureResponse.parse({
    key: definition.key,
    label: definition.label,
    audience: row.audience,
    defaultAudience: definition.defaultAudience,
    updatedAt: row.updatedAt,
  }));
});

router.get('/features', async (req, res) => {
  const features = await Promise.all(FEATURE_DEFINITIONS.map(async (feature) => ({
    key: feature.key,
    enabled: await userCanAccessFeature(req.user?.id, feature.key),
  })));
  res.json(ListAvailableFeaturesResponse.parse({ features }));
});

router.use((error: unknown, _req: Request, res: Response, _next: (error?: unknown) => void) => {
  const candidate = error as { status?: number };
  if (candidate.status) {
    res.status(candidate.status).json({ error: 'La requête administrateur a échoué.' });
    return;
  }
  res.status(500).json({ error: 'Une erreur est survenue dans le tableau administrateur.' });
});

export default router;
