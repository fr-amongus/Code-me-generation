import { ObjectStorageService } from "./objectStorage";

export type StoredAttachment = {
  name: string;
  type: string;
  content: string;
  objectPath?: string;
};

const objectStorage = new ObjectStorageService();

export async function hydrateAttachments(attachments: StoredAttachment[] | undefined): Promise<StoredAttachment[]> {
  return Promise.all((attachments ?? []).map(async (attachment) => {
    if (attachment.content || !attachment.objectPath) return attachment;
    try {
      const file = await objectStorage.getObjectEntityFile(attachment.objectPath);
      const response = await objectStorage.downloadObject(file);
      if (!response.ok) return attachment;
      const encoded = Buffer.from(await response.arrayBuffer()).toString("base64");
      return { ...attachment, content: `data:${attachment.type};base64,${encoded}` };
    } catch {
      return attachment;
    }
  }));
}