'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, PresenceViewerDto, ServerToClientEvents } from '@/lib/shared';
import { config } from '@/lib/config';
import { getToken } from '@/lib/session';

// Live connection to the API (BUILD_SPEC §7 "Collision detection", Phase 6 live list updates).
// Signs in with the session token (read afresh on every reconnect). While connected, lists refresh when the server says something
// changed; if the connection drops, the screens fall back to polling (see useRefreshInterval).

type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Polling while the live connection is down; a slow safety net while it's up. */
const POLL_OFFLINE_MS = 30_000;
const POLL_ONLINE_MS = 5 * 60_000;
/** Retry delays after the server refuses or drops the connection (socket.io won't retry those itself). */
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

interface RealtimeState {
  socket: LiveSocket | null;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeState>({ socket: null, connected: false });

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [state, setState] = useState<RealtimeState>({ socket: null, connected: false });

  useEffect(() => {
    const socket: LiveSocket = io(config.socketUrl, {
      auth: (cb) => cb({ token: getToken() ?? '' }),
      transports: ['websocket', 'polling'],
    });
    setState({ socket, connected: false });

    // Changes arrive in batches; gather them for a moment so a burst causes one refresh.
    const changed = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      timer = null;
      const ids = [...changed];
      changed.clear();
      void client.invalidateQueries({ queryKey: ['tickets'] });
      void client.invalidateQueries({ queryKey: ['ticket-counts'] });
      for (const id of ids) {
        void client.invalidateQueries({ queryKey: ['ticket', id] });
        void client.invalidateQueries({ queryKey: ['history', id] });
      }
    };

    // socket.io retries lost connections itself, but not a handshake the server refused (expired
    // session, API restarting mid-deploy) or a disconnect the server chose; retry those with backoff.
    let retryMs = RETRY_MIN_MS;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const retryLater = () => {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        socket.connect();
      }, retryMs);
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    };
    socket.on('connect_error', (err) => {
      if (socket.active) return; // socket.io is already retrying
      // Refused for the session: re-check it, which shows the sign-in screen if it has ended.
      if (err.message === 'Sign in required') void client.invalidateQueries({ queryKey: ['me'] });
      retryLater();
    });

    socket.on('connect', () => {
      retryMs = RETRY_MIN_MS;
      setState({ socket, connected: true });
      // Catch up on anything missed while disconnected.
      void client.invalidateQueries({ queryKey: ['tickets'] });
      void client.invalidateQueries({ queryKey: ['ticket-counts'] });
    });
    socket.on('disconnect', (reason) => {
      setState({ socket, connected: false });
      if (reason === 'io server disconnect') retryLater();
    });
    socket.on('tickets:changed', ({ ticketIds }) => {
      for (const id of ticketIds) changed.add(id);
      timer ??= setTimeout(refresh, 400);
    });

    return () => {
      if (timer) clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
      socket.disconnect();
    };
  }, [client]);

  return <RealtimeContext.Provider value={state}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}

/** How often a query should poll: often when the live connection is down, rarely when it's up. */
export function useRefreshInterval(): number {
  return useRealtime().connected ? POLL_ONLINE_MS : POLL_OFFLINE_MS;
}

/**
 * Joins an enquiry's presence room while it's open and returns who else is viewing it, plus a way
 * to tell the others when this officer starts or stops writing a reply.
 */
export function usePresence(ticketId: string | null, myUserId: string) {
  const { socket, connected } = useRealtime();
  const [viewers, setViewers] = useState<PresenceViewerDto[]>([]);
  // What this officer is doing on the open ticket, kept across reconnects.
  const replying = useRef({ ticketId, value: false });
  if (replying.current.ticketId !== ticketId) replying.current = { ticketId, value: false };

  useEffect(() => {
    setViewers([]);
    if (!socket || !connected || !ticketId) return;
    const onPresence = (p: { ticketId: string; viewers: PresenceViewerDto[] }) => {
      if (p.ticketId === ticketId) setViewers(p.viewers);
    };
    socket.on('presence', onPresence);
    // Re-joined after every reconnect, since the server forgets connections that drop.
    socket.emit('ticket:join', ticketId);
    if (replying.current.value) socket.emit('ticket:replying', { ticketId, replying: true });
    return () => {
      socket.off('presence', onPresence);
      socket.emit('ticket:leave', ticketId);
    };
  }, [socket, connected, ticketId]);

  const setReplying = useCallback(
    (value: boolean) => {
      if (!ticketId || replying.current.value === value) return;
      replying.current = { ticketId, value };
      if (socket?.connected) socket.emit('ticket:replying', { ticketId, replying: value });
    },
    [socket, ticketId],
  );

  return { others: viewers.filter((v) => v.userId !== myUserId), setReplying };
}
