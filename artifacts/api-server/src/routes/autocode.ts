import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';
import {
  CreateAutoCodeProposalBody,
  CreateAutoCodeProposalResponse,
  GetAutoCodeProposalParams,
  GetAutoCodeProposalResponse,
  ListAutoCodeProposalsResponse,
  RequestAutoCodeUploadUrlBody,
  RequestAutoCodeUploadUrlResponse,
  SendAutoCodeProposalMessageBody,
  SendAutoCodeProposalMessageParams,
  SendAutoCodeProposalMessageResponse,
  SubmitAutoCodeProposalParams,
  SubmitAutoCodeProposalResponse,
} from '@workspace/api-zod';
import {
  autoCodeMessagesTable,
  autoCodeProposalsTable,
  autoCodeUploadsTable,
  autoCodeVersionsTable,
  db,
} from '@workspace/db';
import { requireAuth } from '../middlewares/authMiddleware';
import { recordAiUsage } from '../lib/ai-usage';
import { generateAutoCodeProposal, type AutoCodeAttachment } from '../lib/auto-code-generator';
import {
  isCredentialLike,
  isWritablePlatformPath,
  MAX_AUTOCODE_TOTAL_UPLOAD_BYTES,
  MAX_AUTOCODE_UPLOAD_BYTES,
  MAX_AUTOCODE_UPLOADS_PER_TURN,
  normalizeAutoCodeAttachment,
  sanitizeAutoCodePreview,
} from '../lib/auto-code-policy';
import { userCanAccessFeature } from '../lib/features';
import { readSnapshot } from '../lib/auto-code-snapshots';
import {
  applyAutoCodeChanges,
  buildInitialSnapshot,
  type AutoCodeSnapshotEntry,
  loadPlatformSourceManifest,
  type PlatformSourceFile,
} from '../lib/platform-source';
import { ObjectStorageService } from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

type RouteError = Error & { status?: number };

function routeError(status: number, message: string): RouteError {
  return Object.assign(new Error(message), { status });
}

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

async function getProposalDetail(proposalId: number, ownerUserId: string) {
  const [proposal] = await db
    .select()
    .from(autoCodeProposalsTable)
    .where(and(eq(autoCodeProposalsTable.id, proposalId), eq(autoCodeProposalsTable.ownerUserId, ownerUserId)))
    .limit(1);
  if (!proposal) return null;

  const [messages, versions] = await Promise.all([
    db
      .select({
        id: autoCodeMessagesTable.id,
        role: autoCodeMessagesTable.role,
        content: autoCodeMessagesTable.content,
        createdAt: autoCodeMessagesTable.createdAt,
      })
      .from(autoCodeMessagesTable)
      .where(eq(autoCodeMessagesTable.proposalId, proposalId))
      .orderBy(asc(autoCodeMessagesTable.createdAt), asc(autoCodeMessagesTable.id)),
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
      .where(eq(autoCodeVersionsTable.proposalId, proposalId))
      .orderBy(desc(autoCodeVersionsTable.version)),
  ]);

  return GetAutoCodeProposalResponse.parse({
    ...proposalSummary(proposal),
    messages,
    versions,
  });
}

function normalizeFilename(rawName: string) {
  const name = rawName.replace(/\\/g, '/').split('/').pop() ?? '';
  return name.replace(/[^\p{L}\p{N}._() -]/gu, '_').trim().slice(0, 200);
}

function hasExpectedSignature(contentType: string, bytes: Buffer) {
  if (contentType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/gif') return bytes.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null;
  if (contentType === 'image/webp') {
    return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (contentType === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  return true;
}

async function loadAttachments(uploadIds: number[], ownerUserId: string) {
  if (uploadIds.length > MAX_AUTOCODE_UPLOADS_PER_TURN || new Set(uploadIds).size !== uploadIds.length) {
    throw routeError(400, 'Choisis au maximum cinq fichiers différents.');
  }
  if (!uploadIds.length) return [];

  const uploads = await db
    .select()
    .from(autoCodeUploadsTable)
    .where(and(inArray(autoCodeUploadsTable.id, uploadIds), eq(autoCodeUploadsTable.ownerUserId, ownerUserId)));
  if (
    uploads.length !== uploadIds.length ||
    uploads.some((upload) =>
      upload.proposalId !== null ||
      upload.claimedAt !== null ||
      Date.now() - upload.createdAt.getTime() > UPLOAD_URL_TTL_MS
    )
  ) {
    throw routeError(400, 'Un fichier a expiré ou ne peut pas être utilisé.');
  }

  let totalBytes = 0;
  const results: Array<{ row: (typeof uploads)[number]; attachment: AutoCodeAttachment }> = [];
  for (const upload of uploads) {
    const normalizedType = normalizeAutoCodeAttachment(upload.name, upload.contentType);
    if (!normalizedType) throw routeError(400, `Le fichier « ${upload.name} » n’est pas pris en charge.`);
    const object = await objectStorage.readPrivateObjectEntity(upload.objectPath);
    totalBytes += object.contents.length;
    if (
      object.contents.length !== upload.size ||
      object.contents.length > MAX_AUTOCODE_UPLOAD_BYTES ||
      totalBytes > MAX_AUTOCODE_TOTAL_UPLOAD_BYTES ||
      !hasExpectedSignature(normalizedType, object.contents)
    ) {
      throw routeError(400, `Le fichier « ${upload.name} » est invalide ou trop volumineux.`);
    }
    const storedType = normalizeAutoCodeAttachment(upload.name, object.contentType);
    if (storedType !== normalizedType) throw routeError(400, `Le type du fichier « ${upload.name} » ne correspond pas.`);

    if (normalizedType.startsWith('image/') || normalizedType === 'application/pdf') {
      results.push({
        row: upload,
        attachment: {
          name: upload.name,
          contentType: normalizedType,
          inlineData: { mimeType: normalizedType, data: object.contents.toString('base64') },
        },
      });
      continue;
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(object.contents);
    } catch {
      throw routeError(400, `Le fichier « ${upload.name} » doit être un document texte valide.`);
    }
    if (isCredentialLike(text)) {
      throw routeError(400, `Le fichier « ${upload.name} » semble contenir une clé ou un secret. Retire-le avant l’envoi.`);
    }
    results.push({ row: upload, attachment: { name: upload.name, contentType: normalizedType, text } });
  }
  return results;
}

async function getCurrentSnapshot(
  proposalId: number | null,
  latestVersion: number,
  manifestFiles: PlatformSourceFile[],
) {
  if (!proposalId || latestVersion === 0) return buildInitialSnapshot(manifestFiles);
  const [version] = await db
    .select({ snapshotPath: autoCodeVersionsTable.snapshotPath })
    .from(autoCodeVersionsTable)
    .where(and(eq(autoCodeVersionsTable.proposalId, proposalId), eq(autoCodeVersionsTable.version, latestVersion)))
    .limit(1);
  if (!version) throw new Error('The latest proposal snapshot is missing.');
  return readSnapshot(version.snapshotPath);
}

async function processProposalMessage(input: {
  req: Request;
  message: string;
  uploadIds?: number[];
  proposalId?: number;
}) {
  const ownerUserId = input.req.user!.id;
  if (isCredentialLike(input.message)) {
    throw routeError(400, 'N’envoie pas de clé ou de secret dans le chat Auto-code.');
  }

  const uploads = await loadAttachments(input.uploadIds ?? [], ownerUserId);
  const manifest = await loadPlatformSourceManifest();
  let proposal: typeof autoCodeProposalsTable.$inferSelect | undefined;
  if (input.proposalId !== undefined) {
    [proposal] = await db
      .select()
      .from(autoCodeProposalsTable)
      .where(and(eq(autoCodeProposalsTable.id, input.proposalId), eq(autoCodeProposalsTable.ownerUserId, ownerUserId)))
      .limit(1);
    if (!proposal) throw routeError(404, 'La proposition est introuvable.');
    if (proposal.status !== 'draft' && proposal.status !== 'rejected') {
      throw routeError(409, 'Cette proposition est verrouillée pendant sa revue.');
    }
  }

  const proposalId = proposal?.id ?? (await db
    .insert(autoCodeProposalsTable)
    .values({ ownerUserId, title: 'Nouvelle proposition', status: 'draft' })
    .returning({ id: autoCodeProposalsTable.id }))[0]?.id;
  if (!proposalId) throw new Error('Could not create the proposal.');
  const baseVersion = proposal?.latestVersion ?? 0;
  const currentSnapshot = await getCurrentSnapshot(proposal?.id ?? null, baseVersion, manifest.files);
  const previousMessages = proposal
    ? await db
        .select({ role: autoCodeMessagesTable.role, content: autoCodeMessagesTable.content })
        .from(autoCodeMessagesTable)
        .where(eq(autoCodeMessagesTable.proposalId, proposalId))
        .orderBy(asc(autoCodeMessagesTable.createdAt), asc(autoCodeMessagesTable.id))
    : [];
  const [userMessage] = await db
    .insert(autoCodeMessagesTable)
    .values({ proposalId, role: 'user', content: input.message })
    .returning({ id: autoCodeMessagesTable.id });
  if (!userMessage) throw new Error('Could not save the message.');

  if (uploads.length) {
    await db
      .update(autoCodeUploadsTable)
      .set({ proposalId, messageId: userMessage.id, claimedAt: new Date() })
      .where(inArray(autoCodeUploadsTable.id, uploads.map(({ row }) => row.id)));
  }

  const { proposal: generated, usage } = await generateAutoCodeProposal({
    message: input.message,
    history: previousMessages,
    currentSnapshot,
    attachments: uploads.map(({ attachment }) => attachment),
  });

  const clarifyingQuestion = generated.clarifyingQuestion;
  if (clarifyingQuestion) {
    await db.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ latestVersion: autoCodeProposalsTable.latestVersion })
        .from(autoCodeProposalsTable)
        .where(and(eq(autoCodeProposalsTable.id, proposalId), eq(autoCodeProposalsTable.ownerUserId, ownerUserId)))
        .limit(1);
      if (!current || current.latestVersion !== baseVersion) throw routeError(409, 'La proposition a changé. Recharge-la puis réessaie.');
      await transaction.insert(autoCodeMessagesTable).values({
        proposalId,
        role: 'assistant',
        content: clarifyingQuestion,
      });
    });
    return proposalId;
  }
  if (!generated.changes.length) throw routeError(502, 'L’IA n’a pas proposé de changement exploitable.');
  if (isCredentialLike(generated.notesMarkdown) || isCredentialLike(generated.previewHtml)) {
    throw routeError(502, 'La proposition a été bloquée car elle semble contenir un secret.');
  }

  const sourcePaths = new Set(manifest.files.map((file) => file.path));
  for (const change of generated.changes) {
    if (!isWritablePlatformPath(change.path, sourcePaths)) {
      throw routeError(400, 'La proposition contient un chemin de fichier non autorisé.');
    }
    if (change.action !== 'delete' && typeof change.content !== 'string') {
      throw routeError(502, 'Un fichier généré est incomplet.');
    }
  }

  const baselineFiles = currentSnapshot
    .filter((file) => file.originalContent !== null)
    .map((file) => ({ path: file.path, content: file.originalContent! }));
  let snapshot: AutoCodeSnapshotEntry[];
  try {
    snapshot = applyAutoCodeChanges(baselineFiles, currentSnapshot, generated.changes);
  } catch {
    throw routeError(502, 'L’IA a proposé une modification incompatible avec les fichiers existants.');
  }
  if (snapshot.length > 1500) throw routeError(502, 'La proposition contient trop de fichiers.');
  const snapshotContent = JSON.stringify({ version: 1, files: snapshot });
  if (Buffer.byteLength(snapshotContent, 'utf8') > 12 * 1024 * 1024) {
    throw routeError(502, 'La proposition est trop volumineuse pour être conservée.');
  }

  const changedFiles = snapshot.filter((file) => file.action === 'modified').map((file) => file.path);
  const addedFiles = snapshot.filter((file) => file.action === 'added').map((file) => file.path);
  const deletedFiles = snapshot.filter((file) => file.action === 'deleted').map((file) => file.path);
  const versionNumber = baseVersion + 1;
  const objectBase = `/objects/autocode/proposals/${proposalId}/v${versionNumber}/${randomUUID()}`;
  const snapshotPath = `${objectBase}/snapshot.json`;
  const notesPath = `${objectBase}/notes.md`;
  const previewPath = `${objectBase}/preview.html`;
  const previewHtml = sanitizeAutoCodePreview(generated.previewHtml);
  await Promise.all([
    objectStorage.savePrivateObjectEntity(snapshotPath, snapshotContent, 'application/json'),
    objectStorage.savePrivateObjectEntity(notesPath, generated.notesMarkdown, 'text/markdown; charset=utf-8'),
    objectStorage.savePrivateObjectEntity(previewPath, previewHtml, 'text/html; charset=utf-8'),
  ]);

  const assistantContent = [
    generated.summary,
    '',
    `Version ${versionNumber} prête à être examinée.`,
    `Fichiers modifiés : ${changedFiles.length} · ajoutés : ${addedFiles.length} · supprimés : ${deletedFiles.length}.`,
  ].join('\n');

  await db.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(autoCodeProposalsTable)
      .set({
        title: generated.title,
        status: 'draft',
        latestVersion: versionNumber,
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null,
      })
      .where(and(
        eq(autoCodeProposalsTable.id, proposalId),
        eq(autoCodeProposalsTable.ownerUserId, ownerUserId),
        eq(autoCodeProposalsTable.latestVersion, baseVersion),
      ))
      .returning({ id: autoCodeProposalsTable.id });
    if (!updated) throw routeError(409, 'La proposition a changé. Recharge-la puis réessaie.');

    await transaction.insert(autoCodeVersionsTable).values({
      proposalId,
      version: versionNumber,
      snapshotPath,
      notesPath,
      previewPath,
      summary: generated.summary,
      changedFiles,
      addedFiles,
      deletedFiles,
    });
    await transaction.insert(autoCodeMessagesTable).values({
      proposalId,
      role: 'assistant',
      content: assistantContent,
    });
  });

  try {
    await recordAiUsage({
      userId: ownerUserId,
      provider: usage.provider,
      model: usage.model,
      operation: 'autocode-proposal',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });
  } catch {
    input.req.log.warn('Could not record Auto-code usage metadata');
  }
  return proposalId;
}

function sendRouteError(error: unknown, req: Request, res: Response) {
  const candidate = error as RouteError;
  const status = candidate.status ?? 500;
  if (status >= 500) req.log.error({ status }, 'Auto-code request failed');
  const safeMessage = status < 500 && candidate.message
    ? candidate.message
    : status === 429
      ? 'Le fournisseur IA est temporairement indisponible. Réessaie dans quelques secondes.'
      : 'La génération Auto-code a échoué. Réessaie plus tard.';
  res.status(status).json({ error: safeMessage });
}

router.use('/autocode', requireAuth);
router.use('/autocode', async (req, res, next) => {
  try {
    if (!(await userCanAccessFeature(req.user?.id, 'autocode'))) {
      res.status(403).json({ error: 'Auto-code n’est pas accessible pour ce compte.' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
});

router.post('/autocode/uploads/request-url', async (req, res) => {
  try {
    const parsed = RequestAutoCodeUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Les informations du fichier sont invalides.' });
      return;
    }
    const name = normalizeFilename(parsed.data.name);
    const contentType = normalizeAutoCodeAttachment(name, parsed.data.contentType);
    if (!name || !contentType || parsed.data.size > MAX_AUTOCODE_UPLOAD_BYTES) {
      res.status(400).json({ error: 'Ce fichier n’est pas pris en charge ou dépasse 10 Mo.' });
      return;
    }

    const userPrefix = createHash('sha256').update(req.user!.id).digest('hex').slice(0, 32);
    const signed = await objectStorage.createPrivateUploadURL(`autocode/uploads/u${userPrefix}`);
    const [upload] = await db
      .insert(autoCodeUploadsTable)
      .values({
        ownerUserId: req.user!.id,
        name,
        contentType,
        size: parsed.data.size,
        objectPath: signed.objectPath,
      })
      .returning({ id: autoCodeUploadsTable.id });
    res.json(RequestAutoCodeUploadUrlResponse.parse({ uploadId: upload.id, uploadUrl: signed.uploadURL }));
  } catch (error) {
    sendRouteError(error, req, res);
  }
});

router.get('/autocode/proposals', async (req, res) => {
  const rows = await db
    .select()
    .from(autoCodeProposalsTable)
    .where(eq(autoCodeProposalsTable.ownerUserId, req.user!.id))
    .orderBy(desc(autoCodeProposalsTable.updatedAt));
  res.json(ListAutoCodeProposalsResponse.parse({ proposals: rows.map(proposalSummary) }));
});

router.post('/autocode/proposals', async (req, res) => {
  const parsed = CreateAutoCodeProposalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Décris la proposition avec au moins quelques mots.' });
    return;
  }
  try {
    const proposalId = await processProposalMessage({
      req,
      message: parsed.data.message,
      uploadIds: parsed.data.uploadIds,
    });
    const detail = await getProposalDetail(proposalId, req.user!.id);
    if (!detail) throw new Error('Saved proposal could not be reloaded.');
    res.status(201).json(CreateAutoCodeProposalResponse.parse(detail));
  } catch (error) {
    sendRouteError(error, req, res);
  }
});

router.get('/autocode/proposals/:id', async (req, res) => {
  const params = GetAutoCodeProposalParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: 'La proposition est introuvable.' });
    return;
  }
  const detail = await getProposalDetail(params.data.id, req.user!.id);
  if (!detail) {
    res.status(404).json({ error: 'La proposition est introuvable.' });
    return;
  }
  res.json(detail);
});

router.post('/autocode/proposals/:id/messages', async (req, res) => {
  const params = SendAutoCodeProposalMessageParams.safeParse(req.params);
  const parsed = SendAutoCodeProposalMessageBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: 'Le message ou l’identifiant de proposition est invalide.' });
    return;
  }
  try {
    const proposalId = await processProposalMessage({
      req,
      proposalId: params.data.id,
      message: parsed.data.message,
      uploadIds: parsed.data.uploadIds,
    });
    const detail = await getProposalDetail(proposalId, req.user!.id);
    if (!detail) throw new Error('Saved proposal could not be reloaded.');
    res.json(SendAutoCodeProposalMessageResponse.parse(detail));
  } catch (error) {
    sendRouteError(error, req, res);
  }
});

router.post('/autocode/proposals/:id/submit', async (req, res) => {
  const params = SubmitAutoCodeProposalParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: 'La proposition est introuvable.' });
    return;
  }
  const [proposal] = await db
    .select()
    .from(autoCodeProposalsTable)
    .where(and(eq(autoCodeProposalsTable.id, params.data.id), eq(autoCodeProposalsTable.ownerUserId, req.user!.id)))
    .limit(1);
  if (!proposal) {
    res.status(404).json({ error: 'La proposition est introuvable.' });
    return;
  }
  if (proposal.latestVersion === 0 || (proposal.status !== 'draft' && proposal.status !== 'rejected')) {
    res.status(409).json({ error: 'Cette proposition ne peut pas être envoyée dans son état actuel.' });
    return;
  }
  const [updated] = await db
    .update(autoCodeProposalsTable)
    .set({ status: 'pending_review', submittedAt: new Date() })
    .where(and(
      eq(autoCodeProposalsTable.id, proposal.id),
      eq(autoCodeProposalsTable.ownerUserId, req.user!.id),
      eq(autoCodeProposalsTable.latestVersion, proposal.latestVersion),
    ))
    .returning();
  if (!updated) {
    res.status(409).json({ error: 'La proposition a changé. Recharge-la puis réessaie.' });
    return;
  }
  res.json(SubmitAutoCodeProposalResponse.parse(proposalSummary(updated)));
});

router.use((error: unknown, req: Request, res: Response, _next: (error?: unknown) => void) => {
  sendRouteError(error, req, res);
});

export default router;
