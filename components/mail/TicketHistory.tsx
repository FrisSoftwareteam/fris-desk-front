'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, makeStyles, Spinner, Text, tokens } from '@fluentui/react-components';
import { ChevronDownRegular, ChevronRightRegular, HistoryRegular } from '@fluentui/react-icons';
import { api } from '@/lib/api';
import { formatFullDateTime } from '@/lib/format';

const useStyles = makeStyles({
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: `0 0 0 ${tokens.spacingHorizontalS}`,
    borderLeft: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  item: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    paddingInlineStart: tokens.spacingHorizontalS,
  },
  meta: { color: tokens.colorNeutralForeground3 },
});

/** The enquiry's activity, from the audit log: who did what and when, including automation. */
export function TicketHistory({ ticketId }: { ticketId: string }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ['history', ticketId],
    queryFn: () => api.history(ticketId),
    enabled: open,
    staleTime: 0,
  });

  return (
    <section aria-label="Activity" className="flex flex-col gap-2">
      <div>
        <Button
          appearance="subtle"
          size="small"
          icon={open ? <ChevronDownRegular /> : <ChevronRightRegular />}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="flex items-center gap-1">
            <HistoryRegular aria-hidden /> Activity
          </span>
        </Button>
      </div>
      {open &&
        (history.isPending ? (
          <Spinner size="tiny" label="Loading activity" />
        ) : history.isError ? (
          <Text size={200}>{history.error.message}</Text>
        ) : (
          <ol className={styles.list}>
            {history.data.map((h) => (
              <li key={h.id} className={styles.item}>
                <Text size={200}>{h.summary}</Text>
                <Text size={100} className={styles.meta}>
                  {h.actor ?? 'Registrar Desk, automatically'} on {formatFullDateTime(h.at)}
                </Text>
              </li>
            ))}
          </ol>
        ))}
    </section>
  );
}
