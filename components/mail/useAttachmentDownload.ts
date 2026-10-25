'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useNotify } from '@/lib/notify';

/**
 * Saves an attachment. A plain `<a href>` can't carry the session token, so the file is fetched with
 * it and handed to the browser as a download; failures show a notification.
 */
export function useAttachmentDownload() {
  const notify = useNotify();
  return useCallback(
    (a: { id: string; filename: string }) => {
      api.downloadAttachment(a.id, a.filename).catch((err: unknown) => {
        notify(`Couldn’t download ${a.filename}`, err instanceof Error ? err.message : undefined);
      });
    },
    [notify],
  );
}
