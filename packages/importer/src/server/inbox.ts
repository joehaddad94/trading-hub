import { auth, drive, type drive_v3 } from '@googleapis/drive';

/** Where export files arrive (docs/ops/sync.md). The app only reads files and moves them; it never writes data. */
export type InboxFile = { id: string; name: string; createdTime: string | null };

export interface Inbox {
  list(): Promise<InboxFile[]>;
  download(fileId: string): Promise<string>;
  markProcessed(fileId: string): Promise<void>;
}

/** Drive refused us (credentials revoked, folder unshared) — reported as its own sync-health condition. */
export class InboxAccessError extends Error {
  override name = 'InboxAccessError';
}

const EXPORT_FILE = /^fundednext_\d{4}-\d{2}-\d{2}_\d{4}Z\.json$/;

export function isExportFileName(name: string): boolean {
  return EXPORT_FILE.test(name);
}

export type GoogleDriveInboxOptions = {
  serviceAccountJson: string;
  inboxFolderId: string;
  processedFolderId: string;
};

export function createGoogleDriveInbox(options: GoogleDriveInboxOptions): Inbox {
  const credentials = JSON.parse(options.serviceAccountJson) as { client_email: string; private_key: string };
  const client = drive({
    version: 'v3',
    auth: new auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] }),
  });

  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      const status = (error as { code?: number; status?: number }).code ?? (error as { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) {
        throw new InboxAccessError(`Google Drive refused access (${status}): ${(error as Error).message}`);
      }
      throw error;
    }
  };

  return {
    async list() {
      const files: drive_v3.Schema$File[] = [];
      let pageToken: string | undefined;
      do {
        const res = await call(() =>
          client.files.list({
            q: `'${options.inboxFolderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, createdTime)',
            orderBy: 'name',
            pageSize: 100,
            ...(pageToken ? { pageToken } : {}),
          }),
        );
        files.push(...(res.data.files ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return files.flatMap((f) =>
        f.id && f.name ? [{ id: f.id, name: f.name, createdTime: f.createdTime ?? null }] : [],
      );
    },

    async download(fileId) {
      const res = await call(() => client.files.get({ fileId, alt: 'media' }, { responseType: 'text' }));
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    },

    async markProcessed(fileId) {
      await call(() =>
        client.files.update({
          fileId,
          addParents: options.processedFolderId,
          removeParents: options.inboxFolderId,
          fields: 'id',
        }),
      );
    },
  };
}
