'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Button,
  CounterBadge,
  makeStyles,
  mergeClasses,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  shorthands,
  Spinner,
  Text,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import { AlertRegular } from '@fluentui/react-icons';
import type { NotificationDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { formatListTime } from '@/lib/format';
import { useNotify } from '@/lib/notify';
import { openTicket } from '@/lib/openTicket';
import { useRealtime } from '@/components/realtime/RealtimeProvider';
import { NOTIFICATIONS_KEY, useNotifications } from './useNotifications';

const useStyles = makeStyles({
  // Same look as the other header buttons, but kept on phones too.
  button: {
    position: 'relative',
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': { color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorBrandBackgroundHover },
    ':hover:active': {
      color: tokens.colorNeutralForegroundOnBrand,
      backgroundColor: tokens.colorBrandBackgroundPressed,
    },
  },
  badge: { position: 'absolute', top: '0', right: '0', pointerEvents: 'none' },
  surface: { width: 'min(380px, calc(100vw - 32px))', padding: 0 },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalL,
    ...shorthands.borderBottom(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  },
  list: { maxHeight: 'min(480px, 70vh)', overflowY: 'auto', margin: 0, padding: 0, listStyleType: 'none' },
  item: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    width: '100%',
    textAlign: 'start',
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalL,
    backgroundColor: 'transparent',
    ...shorthands.borderWidth(0),
    cursor: 'pointer',
    color: tokens.colorNeutralForeground1,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  unread: { backgroundColor: tokens.colorBrandBackground2 },
  body: { display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1 },
  clamp: {
    display: '-webkit-box',
    WebkitLineClamp: '2',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    color: tokens.colorNeutralForeground2,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  empty: { padding: tokens.spacingHorizontalXL, textAlign: 'center', color: tokens.colorNeutralForeground3 },
});

/** What happened, in a few words ("Ada mentioned you"). */
export function notificationTitle(n: NotificationDto): string {
  const who = n.actorName ?? 'Someone';
  switch (n.type) {
    case 'mention':
      return `${who} mentioned you`;
    case 'approval_requested':
      return `${who} sent a reply for approval`;
    case 'approval_returned':
      return `${who} returned your reply`;
    case 'approval_sent':
      return `${who} approved and sent your reply`;
  }
}

/** The bell in the header: colleagues' @mentions (and other notices) for the signed-in officer. */
export function NotificationBell() {
  const styles = useStyles();
  const router = useRouter();
  const client = useQueryClient();
  const notify = useNotify();
  const { socket } = useRealtime();
  const { data, isPending } = useNotifications();
  const [open, setOpen] = useState(false);
  const unread = data?.unread ?? 0;

  // Live pushes (mail screen): refresh the bell and counts, and say so briefly.
  useEffect(() => {
    if (!socket) return;
    const onNotification = (n: NotificationDto) => {
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      void client.invalidateQueries({ queryKey: ['ticket-counts'] });
      notify(notificationTitle(n), `${n.ticketReference} · ${n.ticketSubject}`, 'info');
    };
    socket.on('notification', onNotification);
    return () => {
      socket.off('notification', onNotification);
    };
  }, [socket, client, notify]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    void client.invalidateQueries({ queryKey: ['ticket-counts'] });
  };

  const choose = (n: NotificationDto) => {
    setOpen(false);
    if (!n.readAt) void api.readNotifications({ ticketId: n.ticketId }).then(refresh);
    openTicket(n.ticketId, router.push);
  };

  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} positioning="below-end" withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content="Notifications" relationship="label">
          <Button
            appearance="transparent"
            icon={<AlertRegular />}
            className={styles.button}
            aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            {unread > 0 && <CounterBadge count={unread} size="small" color="danger" className={styles.badge} />}
          </Button>
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface className={styles.surface} aria-label="Notifications">
        <div className={styles.head}>
          <Text weight="semibold">Notifications</Text>
          <Button
            appearance="transparent"
            size="small"
            disabled={unread === 0}
            onClick={() => void api.readNotifications({ all: true }).then(refresh)}
          >
            Mark all as read
          </Button>
        </div>
        {isPending ? (
          <Spinner size="small" className="p-6" />
        ) : !data?.items.length ? (
          <div className={styles.empty}>
            <Text>Nothing yet. When a colleague @mentions you in a note, it shows up here.</Text>
          </div>
        ) : (
          <ul className={styles.list}>
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={mergeClasses(styles.item, !n.readAt && styles.unread)}
                  onClick={() => choose(n)}
                >
                  <Avatar name={n.actorName ?? undefined} size={32} color="colorful" />
                  <span className={styles.body}>
                    <Text weight={n.readAt ? 'regular' : 'semibold'}>{notificationTitle(n)}</Text>
                    <Text size={200} truncate wrap={false}>
                      {n.ticketReference} · {n.ticketSubject}
                    </Text>
                    {n.snippet && (
                      <Text size={200} className={styles.clamp}>
                        {n.snippet}
                      </Text>
                    )}
                    <Text size={100} className={styles.muted}>
                      {formatListTime(n.createdAt)}
                    </Text>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverSurface>
    </Popover>
  );
}
