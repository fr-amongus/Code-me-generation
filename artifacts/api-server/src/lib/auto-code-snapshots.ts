import { ObjectStorageService } from './objectStorage';
import type { AutoCodeSnapshotEntry } from './platform-source';

const objectStorage = new ObjectStorageService();

export async function readSnapshot(snapshotPath: string): Promise<AutoCodeSnapshotEntry[]> {
  const object = await objectStorage.readPrivateObjectEntity(snapshotPath);
  const parsed = JSON.parse(object.contents.toString('utf8')) as { files?: unknown };
  if (!Array.isArray(parsed.files)) throw new Error('Stored Auto-code snapshot is invalid.');
  const files = parsed.files as AutoCodeSnapshotEntry[];
  if (files.some((file) =>
    !file ||
    typeof file.path !== 'string' ||
    !['context', 'added', 'modified', 'deleted'].includes(file.action) ||
    typeof file.content !== 'string' ||
    !(typeof file.originalContent === 'string' || file.originalContent === null)
  )) {
    throw new Error('Stored Auto-code snapshot is invalid.');
  }
  return files;
}
