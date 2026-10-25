'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Toast, ToastTitle, ToastTrigger, useToastController } from '@fluentui/react-components';
import type { TicketSummaryDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { TOASTER_ID, useNotify } from '@/lib/notify';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { queryKeys } from './MailboxContext';

/**
 * Delete (to Deleted items), restore and permanently delete, with the list, counts and open
 * enquiry refreshed afterwards. Deleting offers Undo, as Outlook does.
 */
export function useDeletion() {
  const client = useQueryClient();
  const notify = useNotify();
  const { dispatchToast } = useToastController(TOASTER_ID);
  const role = useCurrentUser().role;

  const refresh = useCallback(
    (id: string) => {
      void client.invalidateQueries({ queryKey: ['tickets'] });
      void client.invalidateQueries({ queryKey: queryKeys.counts });
      void client.invalidateQueries({ queryKey: queryKeys.ticket(id) });
      void client.invalidateQueries({ queryKey: ['history', id] });
    },
    [client],
  );

  const restore = useCallback(
    async (ticket: Pick<TicketSummaryDto, 'id' | 'reference'>) => {
      try {
        await api.restoreTicket(ticket.id);
        notify(`${ticket.reference} restored`, undefined, 'success');
      } catch (err) {
        notify('Couldn’t restore the enquiry', (err as Error).message);
      } finally {
        refresh(ticket.id);
      }
    },
    [notify, refresh],
  );

  const remove = useCallback(
    async (ticket: Pick<TicketSummaryDto, 'id' | 'reference'>) => {
      try {
        await api.deleteTicket(ticket.id);
      } catch (err) {
        notify('Couldn’t delete the enquiry', (err as Error).message);
        return;
      } finally {
        refresh(ticket.id);
      }
      dispatchToast(
        <Toast>
          <ToastTitle
            action={
              <ToastTrigger>
                <Link onClick={() => void restore(ticket)}>Undo</Link>
              </ToastTrigger>
            }
          >
            {ticket.reference} moved to Deleted items
          </ToastTitle>
        </Toast>,
        { intent: 'success', timeout: 8000 },
      );
    },
    [dispatchToast, notify, refresh, restore],
  );

  /** Deletes several enquiries (G-04.2), with one Undo for all of them. Resolves true if any moved. */
  const removeMany = useCallback(
    async (ids: string[]): Promise<boolean> => {
      let moved: string[] = [];
      try {
        const result = await api.bulkDelete(ids);
        moved = result.updated;
        if (result.failed.length) {
          notify(`${result.failed.length} of ${ids.length} enquiries weren’t deleted`, result.failed[0]!.error);
        }
      } catch (err) {
        notify('Couldn’t delete those enquiries', (err as Error).message);
      } finally {
        void client.invalidateQueries({ queryKey: ['tickets'] });
        void client.invalidateQueries({ queryKey: ['ticket'] });
        void client.invalidateQueries({ queryKey: queryKeys.counts });
      }
      if (!moved.length) return false;
      const undo = async () => {
        try {
          await api.bulkRestore(moved);
        } catch (err) {
          notify('Couldn’t restore those enquiries', (err as Error).message);
        } finally {
          void client.invalidateQueries({ queryKey: ['tickets'] });
          void client.invalidateQueries({ queryKey: queryKeys.counts });
        }
      };
      dispatchToast(
        <Toast>
          <ToastTitle
            action={
              <ToastTrigger>
                <Link onClick={() => void undo()}>Undo</Link>
              </ToastTrigger>
            }
          >
            {moved.length} {moved.length === 1 ? 'enquiry' : 'enquiries'} moved to Deleted items
          </ToastTitle>
        </Toast>,
        { intent: 'success', timeout: 8000 },
      );
      return true;
    },
    [client, dispatchToast, notify],
  );

  /** Throws on failure so a confirmation dialog can show why. */
  const purge = useCallback(
    async (ticket: Pick<TicketSummaryDto, 'id' | 'reference'>) => {
      await api.purgeTicket(ticket.id);
      client.removeQueries({ queryKey: queryKeys.ticket(ticket.id) });
      void client.invalidateQueries({ queryKey: ['tickets'] });
      void client.invalidateQueries({ queryKey: queryKeys.counts });
      notify(`${ticket.reference} permanently deleted`, undefined, 'success');
    },
    [client, notify],
  );

  return {
    canDelete: role === 'supervisor' || role === 'admin',
    canPurge: role === 'admin',
    remove,
    removeMany,
    restore,
    purge,
  };
}
