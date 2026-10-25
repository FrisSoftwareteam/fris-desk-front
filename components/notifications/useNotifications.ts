'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationListDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { useRealtime } from '@/components/realtime/RealtimeProvider';

export const NOTIFICATIONS_KEY = ['notifications'] as const;

/** The bell's list. Live screens get pushes over the socket; elsewhere it checks every minute. */
export function useNotifications() {
  const { connected } = useRealtime();
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: api.notifications,
    refetchInterval: connected ? 5 * 60_000 : 60_000,
  });
}

/** Marks the officer's notifications about an enquiry as read (when they open it). */
export function useReadTicketNotifications() {
  const client = useQueryClient();
  return useCallback(
    (ticketId: string) => {
      const list = client.getQueryData<NotificationListDto>(NOTIFICATIONS_KEY);
      if (!list?.items.some((n) => n.ticketId === ticketId && !n.readAt)) return;
      void api.readNotifications({ ticketId }).then(() => {
        void client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
        void client.invalidateQueries({ queryKey: ['ticket-counts'] });
      });
    },
    [client],
  );
}
