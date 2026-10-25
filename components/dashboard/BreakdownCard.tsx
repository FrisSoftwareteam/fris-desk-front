'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  tokens,
} from '@fluentui/react-components';
import type { BreakdownGroup, BreakdownRowDto, ReportQuery } from '@/lib/shared';
import { api } from '@/lib/api';
import { formatWorking, pct, useDashboardStyles } from './chartKit';

// Figures per category or folder, to show which kinds of enquiry run late (GAP_ANALYSIS G-06.5).

export function BreakdownCard({ q, dayMins }: { q: ReportQuery | null; dayMins: number }) {
  const styles = useDashboardStyles();
  const [groupBy, setGroupBy] = useState<BreakdownGroup>('category');
  const breakdown = useQuery({
    queryKey: ['report-breakdown', groupBy, q],
    queryFn: () => api.reportBreakdown(q!, groupBy),
    enabled: Boolean(q),
    refetchInterval: 60_000,
  });
  const rows = breakdown.data?.groupBy === groupBy ? breakdown.data.rows : undefined;

  const cols: [string, (r: BreakdownRowDto) => ReactNode][] = [
    ['Received', (r) => r.received],
    ['Resolved', (r) => r.resolved],
    ['Open now', (r) => r.openNow],
    ['Overdue now', (r) => (r.overdueNow ? <span className={styles.danger}>{r.overdueNow}</span> : 0)],
    ['Avg first response', (r) => formatWorking(r.avgFirstResponseMins, dayMins)],
    ['Avg resolution', (r) => formatWorking(r.avgResolutionMins, dayMins)],
    ['SLA met', (r) => pct(r.slaMetPct)],
  ];
  const label = groupBy === 'category' ? 'Category' : 'Folder';

  return (
    <section className={styles.card} aria-labelledby="breakdown">
      <div className={styles.cardHeader}>
        <Text id="breakdown" weight="semibold" size={400}>
          By {groupBy}
        </Text>
        <TabList size="small" selectedValue={groupBy} onTabSelect={(_, d) => setGroupBy(d.value as BreakdownGroup)}>
          <Tab value="category">Category</Tab>
          <Tab value="folder">Folder</Tab>
        </TabList>
      </div>
      {!rows ? (
        <Spinner size="small" label="Loading figures" />
      ) : rows.length === 0 ? (
        <Text size={300} className={styles.muted}>
          No {groupBy === 'category' ? 'categories' : 'folders'} to show yet.
        </Text>
      ) : (
        <div className={styles.tableWrap}>
          <Table size="small" aria-label={`Figures by ${groupBy}`} style={{ minWidth: 820 }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{label}</TableHeaderCell>
                {cols.map(([name]) => (
                  <TableHeaderCell key={name} className={styles.num}>
                    <span className="w-full text-right">{name}</span>
                  </TableHeaderCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id ?? 'none'}>
                  <TableCell>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {groupBy === 'category' && (
                        <span
                          className={styles.swatch}
                          style={{ backgroundColor: r.color ?? tokens.colorNeutralStroke1 }}
                          aria-hidden
                        />
                      )}
                      <span className={r.id ? undefined : styles.muted}>{r.name}</span>
                    </span>
                  </TableCell>
                  {cols.map(([name, value]) => (
                    <TableCell key={name} className={styles.num}>
                      <span className="w-full text-right">{value(r)}</span>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {groupBy === 'category' && rows && rows.length > 0 && (
        <Text size={200} block className={styles.muted} style={{ marginTop: tokens.spacingVerticalS }}>
          An enquiry with several categories is counted under each. “Open now” and “Overdue now” ignore the date range.
        </Text>
      )}
    </section>
  );
}
