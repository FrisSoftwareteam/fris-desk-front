'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type {
  BulkResultDto,
  BulkTicketPatchDto,
  CategoryDto,
  FolderDto,
  MailboxStatusDto,
  StaffDto,
  StatusReasonDto,
  SystemView,
  TicketCountsDto,
  TicketDetailDto,
  TicketListResponse,
  TicketPatchDto,
  TicketStatus,
  TicketSummaryDto,
} from '@/lib/shared';
import { api } from '@/lib/api';
import { useNotify } from '@/lib/notify';
import { useRefreshInterval } from '@/components/realtime/RealtimeProvider';

/** Built-in views shown above the folders, like Outlook's Inbox / Drafts / Sent. */
export const SYSTEM_VIEWS: { id: SystemView; name: string }[] = [
  { id: 'inbox', name: 'All enquiries' },
  { id: 'mine', name: 'Assigned to me' },
  { id: 'mentions', name: 'Mentioned me' },
  { id: 'approvals', name: 'Awaiting approval' },
  { id: 'unassigned', name: 'Unassigned' },
  { id: 'overdue', name: 'Overdue' },
  { id: 'followups', name: 'Follow-ups' },
  { id: 'drafts', name: 'Drafts' },
  // Only supervisors and admins see this one (FolderPane hides it for agents).
  { id: 'deleted', name: 'Deleted items' },
];
export type SystemViewId = SystemView;

/** A system view id, or `folder:<folderId>`. */
export type ViewId = SystemViewId | `folder:${string}`;

export const queryKeys = {
  tickets: (view: ViewId, tab: string, q: string) => ['tickets', view, tab, q] as const,
  ticket: (id: string) => ['ticket', id] as const,
  counts: ['ticket-counts'] as const,
  statusReasons: ['status-reasons'] as const,
  attachmentPreview: (id: string) => ['attachment-preview', id] as const,
  attachmentBlob: (id: string) => ['attachment-blob', id] as const,
};

// Lookups and actions only. The mailbox sync status and unread counts change every few seconds, so
// they're read with useMailboxStatus / useTicketCounts by the few components that show them, rather
// than re-rendering every consumer of this context (the whole mail screen) each time.
interface MailboxState {
  folders: FolderDto[];
  categories: CategoryDto[];
  officers: StaffDto[];
  categoryById: Map<string, CategoryDto>;
  /** Admin-defined stages, retired ones included (an enquiry may still be at one). */
  statusReasons: StatusReasonDto[];
  statusReasonById: Map<string, StatusReasonDto>;
  viewName: (view: ViewId) => string;
  updateTicket: (ticketId: string, patch: TicketPatchDto) => void;
  markRead: (ticketId: string, read: boolean) => void;
  setStatus: (ticketId: string, status: TicketStatus) => void;
  assign: (ticketId: string, officerId: string | null) => void;
  toggleCategory: (ticket: Pick<TicketSummaryDto, 'id' | 'categoryIds'>, categoryId: string) => void;
  moveToFolder: (ticketId: string, folderId: string | null) => void;
  /**
   * One change for several enquiries (G-04.2). Says which were refused, refreshes the lists and
   * resolves with the result (undefined if the request failed).
   */
  bulkUpdate: (ids: string[], patch: BulkTicketPatchDto['patch']) => Promise<BulkResultDto | undefined>;
  bulkRestore: (ids: string[]) => Promise<BulkResultDto | undefined>;
  /** Updates the [Draft] marker and Drafts count after a draft is saved, sent or discarded. */
  setHasDraft: (ticketId: string, hasDraft: boolean) => void;
}

const MailboxContext = createContext<MailboxState | null>(null);

/** Applies a patch to every cached copy of a ticket (lists and the open ticket) for instant feedback. */
function patchCachedTicket(client: QueryClient, id: string, update: (t: TicketSummaryDto) => TicketSummaryDto) {
  client.setQueriesData<InfiniteData<TicketListResponse>>({ queryKey: ['tickets'] }, (data) =>
    data
      ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((t) => (t.id === id ? update(t) : t)) })) }
      : data,
  );
  client.setQueryData<TicketDetailDto>(queryKeys.ticket(id), (t) => (t ? { ...t, ...update(t) } : t));
}

export function MailboxProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const refreshMs = useRefreshInterval();
  const notify = useNotify();
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders, staleTime: 5 * 60_000 });
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 });
  const officers = useQuery({ queryKey: ['users'], queryFn: api.users, staleTime: 5 * 60_000 });
  const statusReasons = useQuery({
    queryKey: queryKeys.statusReasons,
    queryFn: api.statusReasons,
    staleTime: 5 * 60_000,
  });

  const officerList = useMemo(() => officers.data ?? [], [officers.data]);
  const categoryList = useMemo(() => categories.data ?? [], [categories.data]);
  const folderList = useMemo(() => folders.data ?? [], [folders.data]);
  const categoryById = useMemo(() => new Map(categoryList.map((c) => [c.id, c])), [categoryList]);
  const reasonList = useMemo(() => statusReasons.data ?? [], [statusReasons.data]);
  const statusReasonById = useMemo(() => new Map(reasonList.map((r) => [r.id, r])), [reasonList]);

  const mutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TicketPatchDto }) => api.patchTicket(id, patch),
    onMutate: async ({ id, patch }) => {
      // Stop in-flight refreshes from overwriting the optimistic change. Only cancel queries that
      // already have data: cancelling a first load (e.g. the ticket being opened right now) would
      // leave it with nothing to show until the next refresh.
      const hasData = (q: { state: { data: unknown } }) => q.state.data !== undefined;
      await client.cancelQueries({ queryKey: ['tickets'], predicate: hasData });
      await client.cancelQueries({ queryKey: queryKeys.ticket(id), predicate: hasData });
      const assignee =
        patch.assigneeId === undefined
          ? undefined
          : patch.assigneeId === null
            ? null
            : (officerList.find((o) => o.id === patch.assigneeId) ?? null);
      const reason = patch.statusReasonId ? statusReasonById.get(patch.statusReasonId) : undefined;
      patchCachedTicket(client, id, (t) => ({
        ...t,
        ...(patch.isUnread !== undefined && { isUnread: patch.isUnread }),
        // A plain status change drops the stage, as the server does.
        ...(patch.status && { status: patch.status, statusReasonId: null }),
        ...(reason && { status: reason.baseStatus }),
        ...(patch.statusReasonId !== undefined && { statusReasonId: patch.statusReasonId }),
        ...(patch.categoryIds && { categoryIds: patch.categoryIds }),
        ...(patch.priority && { priority: patch.priority }),
        ...(patch.folderId !== undefined && { folderId: patch.folderId }),
        ...(assignee !== undefined && { assignee: assignee && { id: assignee.id, displayName: assignee.displayName } }),
      }));
    },
    onSuccess: (saved) => patchCachedTicket(client, saved.id, (t) => ({ ...t, ...saved, hasDraft: t.hasDraft })),
    onError: (err, { id }) => {
      // Say why (e.g. an agent assigning someone else), then put back the server's version.
      notify('That change wasn’t saved', (err as Error).message);
      void client.invalidateQueries({ queryKey: queryKeys.ticket(id) });
      void client.invalidateQueries({ queryKey: ['tickets'] });
    },
    onSettled: (_data, _err, { patch }) => {
      void client.invalidateQueries({ queryKey: queryKeys.counts });
      // These can move the enquiry into or out of the list being viewed (a folder, Open/Resolved,
      // Assigned to me, Unassigned), so refresh the lists rather than waiting for the next poll.
      if (
        patch.folderId !== undefined ||
        patch.status ||
        patch.statusReasonId !== undefined ||
        patch.assigneeId !== undefined ||
        patch.followUp !== undefined
      ) {
        void client.invalidateQueries({ queryKey: ['tickets'] });
      }
    },
  });

  const { mutate } = mutation;
  const updateTicket = useCallback((id: string, patch: TicketPatchDto) => mutate({ id, patch }), [mutate]);

  /** Runs a bulk request, then reports refusals and refreshes everything the change may affect. */
  const runBulk = useCallback(
    async (ids: string[], call: () => Promise<BulkResultDto>): Promise<BulkResultDto | undefined> => {
      try {
        const result = await call();
        if (result.failed.length) {
          const first = result.failed[0]!;
          notify(
            `${result.failed.length} of ${ids.length} enquiries weren’t changed`,
            `${first.reference ?? 'An enquiry'}: ${first.error}`,
          );
        }
        return result;
      } catch (err) {
        notify('Those changes weren’t saved', (err as Error).message);
        return undefined;
      } finally {
        void client.invalidateQueries({ queryKey: ['tickets'] });
        void client.invalidateQueries({ queryKey: ['ticket'] });
        void client.invalidateQueries({ queryKey: queryKeys.counts });
      }
    },
    [client, notify],
  );

  const value = useMemo<MailboxState>(
    () => ({
      folders: folderList,
      categories: categoryList,
      officers: officerList,
      categoryById,
      statusReasons: reasonList,
      statusReasonById,
      viewName: (view) =>
        view.startsWith('folder:')
          ? (folderList.find((f) => `folder:${f.id}` === view)?.name ?? 'Folder')
          : (SYSTEM_VIEWS.find((v) => v.id === view)?.name ?? ''),
      updateTicket,
      markRead: (id, read) => updateTicket(id, { isUnread: !read }),
      setStatus: (id, status) => updateTicket(id, { status }),
      assign: (id, officerId) => updateTicket(id, { assigneeId: officerId }),
      moveToFolder: (id, folderId) => updateTicket(id, { folderId }),
      bulkUpdate: (ids, patch) => runBulk(ids, () => api.bulkUpdate({ ids, patch })),
      bulkRestore: (ids) => runBulk(ids, () => api.bulkRestore(ids)),
      setHasDraft: (id, hasDraft) => {
        // Adjust the Drafts count straight away if this ticket's state changes; the refetch confirms it.
        const was = client.getQueryData<TicketDetailDto>(queryKeys.ticket(id))?.hasDraft;
        if (was !== undefined && was !== hasDraft) {
          client.setQueryData<TicketCountsDto>(queryKeys.counts, (c) =>
            c ? { ...c, views: { ...c.views, drafts: Math.max(0, c.views.drafts + (hasDraft ? 1 : -1)) } } : c,
          );
        }
        patchCachedTicket(client, id, (t) => (t.hasDraft === hasDraft ? t : { ...t, hasDraft }));
        void client.invalidateQueries({ queryKey: queryKeys.counts });
        void client.invalidateQueries({ queryKey: ['tickets', 'drafts'] });
      },
      toggleCategory: (ticket, categoryId) =>
        updateTicket(ticket.id, {
          categoryIds: ticket.categoryIds.includes(categoryId)
            ? ticket.categoryIds.filter((c) => c !== categoryId)
            : [...ticket.categoryIds, categoryId],
        }),
    }),
    [
      client,
      folderList,
      categoryList,
      officerList,
      categoryById,
      reasonList,
      statusReasonById,
      updateTicket,
      runBulk,
    ],
  );

  return <MailboxContext.Provider value={value}>{children}</MailboxContext.Provider>;
}

export function useMailbox(): MailboxState {
  const ctx = useContext(MailboxContext);
  if (!ctx) throw new Error('useMailbox must be used inside <MailboxProvider>');
  return ctx;
}

/**
 * The shared mailbox's sync status (polled: it isn't pushed). Pass `select` to take only the fields
 * a component shows, so it doesn't re-render each time the last-sync time moves on.
 */
export function useMailboxStatus<T = MailboxStatusDto>(select?: (m: MailboxStatusDto) => T) {
  return useQuery({ queryKey: ['mailbox'], queryFn: api.mailbox, refetchInterval: 30_000, select }).data;
}

/** Unread counts for the folder pane. */
export function useTicketCounts(): TicketCountsDto | undefined {
  const refreshMs = useRefreshInterval();
  return useQuery({ queryKey: queryKeys.counts, queryFn: api.ticketCounts, refetchInterval: refreshMs }).data;
}

/** The open ticket with its messages. */
export function useTicket(id: string | null) {
  const refreshMs = useRefreshInterval();
  return useQuery({
    queryKey: queryKeys.ticket(id ?? ''),
    queryFn: () => api.ticket(id!),
    enabled: Boolean(id),
    refetchInterval: refreshMs,
  });
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  awaiting_shareholder: 'Awaiting shareholder',
  escalated: 'Escalated',
  resolved: 'Resolved',
};
