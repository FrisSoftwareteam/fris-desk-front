'use client';

import { useEffect, useState } from 'react';
import { makeStyles, mergeClasses, Text, Tooltip, tokens } from '@fluentui/react-components';
import {
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  ArrowSyncRegular,
  PlugDisconnectedRegular,
} from '@fluentui/react-icons';
import { useRealtime } from '@/components/realtime/RealtimeProvider';
import { useMailboxStatus } from './MailboxContext';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    color: tokens.colorNeutralForeground3,
  },
  error: { color: tokens.colorPaletteRedForeground1 },
});

function ago(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

/** Outlook-style status line: is new mail still arriving, and are live updates connected? */
export function SyncStatus() {
  return (
    <>
      <LiveStatus />
      <MailboxSyncStatus />
    </>
  );
}

/** Shown only when the live connection has been down for a few seconds (not during the first connect). */
function LiveStatus() {
  const styles = useStyles();
  const { connected } = useRealtime();
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (connected) {
      setDown(false);
      return;
    }
    const t = setTimeout(() => setDown(true), 5_000);
    return () => clearTimeout(t);
  }, [connected]);
  if (!down) return null;
  return (
    <Tooltip
      content="Others' changes and who is viewing an enquiry won't show straight away. Lists still refresh every 30 seconds."
      relationship="description"
    >
      <div className={styles.root} role="status">
        <PlugDisconnectedRegular />
        <Text size={200}>Live updates paused. Reconnecting…</Text>
      </div>
    </Tooltip>
  );
}

function MailboxSyncStatus() {
  const styles = useStyles();
  const mailbox = useMailboxStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!mailbox) return null;

  if (!mailbox.syncEnabled) {
    return (
      <div className={styles.root}>
        <ErrorCircleRegular />
        <Text size={200}>Mailbox sync is off</Text>
      </div>
    );
  }

  if (mailbox.lastSyncError) {
    return (
      <Tooltip content={mailbox.lastSyncError} relationship="description">
        <div className={mergeClasses(styles.root, styles.error)} role="status">
          <ErrorCircleRegular />
          <Text size={200}>Mail isn&apos;t syncing. Retrying…</Text>
        </div>
      </Tooltip>
    );
  }

  if (!mailbox.lastSyncAt) {
    return (
      <div className={styles.root} role="status">
        <ArrowSyncRegular />
        <Text size={200}>Importing recent mail…</Text>
      </div>
    );
  }

  // Older than three poll intervals means syncing has stalled.
  const stale = now - new Date(mailbox.lastSyncAt).getTime() > mailbox.pollIntervalSeconds * 3_000;
  const how = mailbox.pushEnabled
    ? 'Live updates on'
    : `Checks every ${Math.round(mailbox.pollIntervalSeconds / 60) || 1} min`;
  return (
    <Tooltip content={how} relationship="description">
      <div className={styles.root} role="status">
        <CheckmarkCircleRegular />
        <Text size={200}>{stale ? `Updated ${ago(mailbox.lastSyncAt, now)}` : 'All folders are up to date'}</Text>
      </div>
    </Tooltip>
  );
}
