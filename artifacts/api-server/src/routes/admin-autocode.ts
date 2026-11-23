import { and, asc, desc, eq } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';
import {
  GetAdminAutoCodeProposalParams,
  GetAdminAutoCodeProposalResponse,
  ListAdminAutoCodeProposalsResponse,
  ReadAdminAutoCodeProposalFileBody,
  ReadAdminAutoCodeProposalFileResponse,
  ReviewAdminAutoCodeProposalBody,
  ReviewAdminAutoCodeProposalParams,
  ReviewAdminAutoCodeProposalResponse,
} from '@workspace/api-zod';
import {
  adminAuditEventsTable,
  autoCodeMessagesTable,
  autoCodeProposalsTable,
  autoCodeReviewsTable,
  autoCodeUploadsTable,
  autoCodeVersionsTable,
  db,
  usersTable,
} from '@workspace/db';
import { requireOwnerAdmin } from '../middlewares/authMiddleware';
import { readSnapshot } from '../lib/auto-code-snapshots';
import { ObjectStorageService } from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

function proposalSummary(row: typeof autoCodeProposalsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    latestVersion: row.latestVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
  };
}

router.get('/admin/autocode/proposals', requireOwnerAdmin, async (_req, res) => {
  const rows = await db
    .select({
      proposal: autoCodeProposalsTable,
      ownerUsername: usersTable.username,
    })
    .from(autoCodeProposalsTable)
    .innerJoin(usersTable, eq(autoCodeProposalsTable.ownerUserId, usersTable.id))
    .orderBy(desc(autoCodeProposalsTable.updatedAt));
  res.json(ListAdminAutoCodeProposalsResponse.parse({
    proposals: rows.map(({ proposal, ownerUsername }) => ({
      ...proposalSummary(proposal),
      ownerUsername,
    })),
  }));
});

router.get('/admin/autocode/proposals/:id', requireOwnerAdmin, async (req, res) => {
  const params = GetAdminAutoCodeProposalParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: 'La proposition est introuvable.' });
    return;
  }
  const [row] = await db
    .select({
      proposal: autoCodeProposalsTable,
      ownerUsername: usersTable.username,
    })
    .from(autoCodeProposalsTable)
    .innerJoin(usersTable, eq(autoCodeProposalsTable.ownerUserId, usersTable.id))
    .where(eq(autoCodeProposalsTable.id, params.data.id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: 'La proposition est introuvable.' });
    return;
  }

  const [versions, messages, attachments, [latestVersion], [latestReview]] = await Promise.all([
    db
      .select({
        id: autoCodeVersionsTable.id,
        version: autoCodeVersionsTable.version,
        summary: autoCodeVersionsTable.summary,
        changedFiles: autoCodeVersionsTable.changedFiles,
        addedFiles: autoCodeVersionsTable.addedFiles,
        deletedFiles: autoCodeVersionsTable.deletedFiles,
        createdAt: autoCodeVersionsTable.createdAt,
      })
      .from(autoCodeVersionsTable)
      .where(eq(autoCodeVersionsTable.proposalId, row.proposal.id))
      .orderBy(desc(autoCodeVersionsTable.version)),
    db
      .select({
        id: autoCodeMessagesTable.id,
        role: autoCodeMessagesTable.role,
        content: autoCodeMessagesTable.content,
        createdAt: autoCodeMessagesTable.createdAt,
      })
      .from(autoCodeMessagesTable)
      .where(eq(autoCodeMessagesTable.proposalId, row.proposal.id))
      .orderBy(asc(autoCodeMessagesTable.createdAt), asc(autoCodeMessagesTable.id)),
    db
      .select({
        id: autoCodeUploadsTable.id,
        name: autoCodeUploadsTable.name,
        contentType: autoCodeUploadsTable.contentType,
        size: autoCodeUploadsTable.size,
      })
      .from(autoCodeUploadsTable)
      .where(eq(autoCodeUploadsTable.proposalId, row.proposal.id))
      .orderBy(asc(autoCodeUploadsTable.createdAt)),
    db
      .select()
      .from(autoCodeVersionsTable)
      .where(and(
        eq(autoCodeVersionsTable.proposalId, row.proposal.id),
        eq(autoCodeVersionsTable.version, row.proposal.latestVersion),
      ))
      .limit(1),
    db
      .select({ note: autoCodeReviewsTable.note })
      .from(autoCodeReviewsTable)
      .where(eq(autoCodeReviewsTable.proposalId, row.proposal.id))
      .orderBy(desc(autoCodeReviewsTable.createdAt))
      .limit(1),
  ]);

  let files: Array<{ path: string; action: 'context' | 'added' | 'modified' | 'deleted' }> = [];
  let notesMarkdown = '';
  let previewHtml = '';
  if (latestVersion) {
    const [snapshotObject, notesObject, previewObject] = await Promise.all([
      readSnapshot(latestVersion.snapshotPath),
      objectStorage.readPrivateObjectEntity(latestVersion.notesPath),
      objectStorage.readPrivateObjectEntity(latestVersion.previewPath),
    ]);
    files = snapshotObject.map(({ path, action }) => ({ path, action }));
    notesMarkdown = notesObject.contents.toString('utf8');
    previewHtml = previewObject.contents.toString('utf8');
  }

  res.json(GetAdminAutoCodeProposalResponse.parse({
    ...proposalSummary(row.proposal),
    ownerUsername: row.ownerUsername,
    messages,
    versions,
    files,
    notesMarkdown,
    previewHtml,
    attachments,
    reviewNote: latestReview?.note ?? null,
  }));
});

router.post('/admin/autocode/proposal-file', requireOwnerAdmin, async (req, res) => {
  const parsed = ReadAdminAutoCodeProposalFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Le fichier demandé est invalide.' });
    return;
  }
  const [proposal] = await db
    .select({ snapshotPath: autoCodeVersionsTable.snapshotPath })
    .from(autoCodeProposalsTable)
    .leftJoin(autoCodeVersionsTable, and(
      eq(autoCodeVersionsTable.proposalId, autoCodeProposalsTable.id),
      eq(autoCodeVersionsTable.version, autoCodeProposalsTable.latestVersion),
    ))
    .where(eq(autoCodeProposalsTable.id, parsed.data.proposalId))
    .limit(1);
  const snapshotPath = (proposal as typeof proposal & { snapshotPath?: string | null } | undefined)?.snapshotPath;
  if (!snapshotPath) {
    res.status(404).json({ error: 'La proposition ou son fichier est introuvable.' });
    return;
  }
  const snapshot = await readSnapshot(snapshotPath);
  const file = snapshot.find((entry) => entry.path === parsed.data.path);
  if (!file) {
    res.status(404).json({ error: 'La proposition ou son fichier est introuvable.' });
    return;
  }
  res.json(ReadAdminAutoCodeProposalFileResponse.parse({
    path: file.path,
    action: file.action,
    content: file.action === 'deleted' ? file.originalContent ?? '' : file.content,
    originalContent: file.action === 'modified' || file.action === 'deleted' ? file.originalContent : null,
  }));
});

router.post('/admin/autocode/proposals/:id/review', requireOwnerAdmin, async (req, res) => {
  const params = ReviewAdminAutoCodeProposalParams.safeParse(req.params);
  const parsed = ReviewAdminAutoCodeProposalBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: 'La décision de revue est invalide.' });
    return;
  }

  const [proposal] = await db
    .select()
    .from(autoCodeProposalsTable)
    .where(eq(autoCodeProposalsTable.id, params.data.id))
    .limit(1);
  if (!proposal) {
    res.status(404).json({ error: 'La proposition est introuvable.' });
    return;
  }

  const { decision } = parsed.data;
  const nextStatus = decision === 'approve'
    ? 'approved'
    : decision === 'reject'
      ? 'rejected'
      : 'applied';
  const validState = decision === 'mark_applied'
    ? proposal.status === 'approved'
    : proposal.status === 'pending_review';
  if (!validState) {
    res.status(409).json({ error: decision === 'mark_applied'
      ? 'Marque comme appliquée uniquement une proposition déjà approuvée et déployée manuellement.'
      : 'Seules les propositions en attente peuvent être approuvées ou refusées.' });
    return;
  }

  try {
    const updated = await db.transaction(async (transaction) => {
      const expectedStatus = proposal.status;
      const [result] = await transaction
        .update(autoCodeProposalsTable)
        .set(decision === 'mark_applied'
          ? { status: nextStatus, appliedAt: new Date(), appliedBy: req.user!.id }
          : { status: nextStatus, reviewedAt: new Date(), reviewedBy: req.user!.id })
        .where(and(
          eq(autoCodeProposalsTable.id, proposal.id),
          eq(autoCodeProposalsTable.status, expectedStatus),
        ))
        .returning();
      if (!result) throw Object.assign(new Error('Proposal state changed'), { code: 'STATE_CHANGED' });

      await transaction.insert(autoCodeReviewsTable).values({
        proposalId: proposal.id,
        actorUserId: req.user!.id,
        decision,
        note: parsed.data.note?.trim() || null,
      });
      await transaction.insert(adminAuditEventsTable).values({
        actorUserId: req.user!.id,
        action: `autocode_${decision}`,
        targetType: 'autocode_proposal',
        targetId: String(proposal.id),
        details: { version: proposal.latestVersion },
      });
      return result;
    });

    res.json(ReviewAdminAutoCodeProposalResponse.parse({
      proposal: proposalSummary(updated),
      reviewNote: parsed.data.note?.trim() || null,
    }));
  } catch (error) {
    const candidate = error as { code?: string };
    if (candidate.code === 'STATE_CHANGED') {
      res.status(409).json({ error: 'La proposition a déjà été modifiée par une autre revue.' });
      return;
    }
    req.log.error({ err: error }, 'Auto-code review failed');
    res.status(500).json({ error: 'La décision de revue n’a pas pu être enregistrée.' });
  }
});

router.use((error: unknown, req: Request, res: Response, _next: (error?: unknown) => void) => {
  req.log.error({ err: error }, 'Auto-code admin request failed');
  res.status(500).json({ error: 'La page de revue Auto-code n’a pas pu être chargée.' });
});

export default router;
