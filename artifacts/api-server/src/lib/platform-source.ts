import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type PlatformSourceFile = { path: string; content: string };
export type PlatformSourceManifest = { version: number; files: PlatformSourceFile[]; revision: string };

export async function loadPlatformSourceManifest(): Promise<PlatformSourceManifest> {
  const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'platform-source.json');
  const raw = await readFile(sourcePath, 'utf8');
  const parsed = JSON.parse(raw) as { version?: unknown; files?: unknown };
  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.files) ||
    parsed.files.some((entry) =>
      !entry ||
      typeof entry !== 'object' ||
      typeof (entry as PlatformSourceFile).path !== 'string' ||
      typeof (entry as PlatformSourceFile).content !== 'string'
    )
  ) {
    throw new Error('The built platform source manifest is invalid.');
  }
  const files = parsed.files as PlatformSourceFile[];
  return {
    version: 1,
    files,
    revision: createHash('sha256').update(files.map((file) => `${file.path}\0${file.content}`).join('\0')).digest('hex'),
  };
}

export type AutoCodeSnapshotEntry = {
  path: string;
  action: 'context' | 'added' | 'modified' | 'deleted';
  content: string;
  originalContent: string | null;
};

export function buildInitialSnapshot(files: PlatformSourceFile[]): AutoCodeSnapshotEntry[] {
  return files.map((file) => ({
    path: file.path,
    action: 'context',
    content: file.content,
    originalContent: file.content,
  }));
}

export function applyAutoCodeChanges(
  baselineFiles: PlatformSourceFile[],
  previousSnapshot: AutoCodeSnapshotEntry[],
  changes: Array<{ path: string; action: 'add' | 'modify' | 'delete'; content?: string }>,
): AutoCodeSnapshotEntry[] {
  const baseline = new Map(baselineFiles.map((file) => [file.path, file.content]));
  const current = new Map(previousSnapshot.map((entry) => [entry.path, { ...entry }]));
  const seen = new Set<string>();

  for (const change of changes) {
    if (seen.has(change.path)) throw new Error('The proposal contains a duplicate file path.');
    seen.add(change.path);
    const previous = current.get(change.path);
    if (change.action === 'add') {
      if (previous && previous.action !== 'deleted') throw new Error('A proposed new file already exists.');
      if (!change.content) throw new Error('A new file must include its contents.');
      const originalContent = previous?.originalContent ?? baseline.get(change.path) ?? null;
      current.set(change.path, {
        path: change.path,
        action: originalContent === null ? 'added' : change.content === originalContent ? 'context' : 'modified',
        content: change.content,
        originalContent,
      });
      continue;
    }
    if (!previous || previous.action === 'deleted') throw new Error('A changed file does not exist in the current proposal.');
    if (change.action === 'delete') {
      if (previous.originalContent === null || (!baseline.has(change.path) && previous.action === 'added')) {
        current.delete(change.path);
      } else {
        current.set(change.path, {
          path: change.path,
          action: 'deleted',
          content: '',
          originalContent: previous.originalContent ?? baseline.get(change.path) ?? previous.content,
        });
      }
      continue;
    }
    if (typeof change.content !== 'string') throw new Error('A modified file must include its contents.');
    const originalContent = previous.originalContent ?? baseline.get(change.path) ?? null;
    const action = originalContent === null ? 'added' : change.content === originalContent ? 'context' : 'modified';
    current.set(change.path, {
      path: change.path,
      action,
      content: change.content,
      originalContent,
    });
  }

  return [...current.values()].sort((left, right) => left.path.localeCompare(right.path));
}
