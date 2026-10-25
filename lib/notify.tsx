'use client';

import { useCallback } from 'react';
import { Toast, ToastBody, ToastTitle, useToastController } from '@fluentui/react-components';

/** The app's single toaster, rendered in app/providers.tsx. */
export const TOASTER_ID = 'registrar-desk';

/** Shows a short Outlook-style notification in the corner, e.g. when a change couldn't be saved. */
export function useNotify() {
  const { dispatchToast } = useToastController(TOASTER_ID);
  return useCallback(
    (title: string, body?: string, intent: 'error' | 'warning' | 'success' | 'info' = 'error') =>
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent, timeout: intent === 'error' ? 8000 : 4000 },
      ),
    [dispatchToast],
  );
}
