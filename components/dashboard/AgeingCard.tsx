'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  mergeClasses,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReportQuery } from '@/lib/shared';
import { api } from '@/lib/api';
import { useChartChrome, useDashboardStyles } from './chartKit';

// Open enquiries now by how long they've waited (GAP_ANALYSIS G-06.5). Like "Open now", it ignores
// the date range; the officer and folder filters apply.

/** Axis labels short enough for a phone ("1–3d"); the tooltip keeps the full band name. */
const shortBand = (band: string) => band.replace('Under 1 day', '<1d').replace(' days', 'd');

export function AgeingCard({ q }: { q: ReportQuery | null }) {
  const styles = useDashboardStyles();
  const { ink, axis, tooltipStyle, legendText } = useChartChrome();
  const ageing = useQuery({
    queryKey: ['report-ageing', q],
    queryFn: () => api.reportAgeing(q!),
    enabled: Boolean(q),
    refetchInterval: 60_000,
  });
  const data = ageing.data?.bands.map((b) => ({ band: b.band, overdue: b.overdue, onTime: b.total - b.overdue }));
  const total = ageing.data?.bands.reduce((a, b) => a + b.total, 0) ?? 0;

  return (
    <section className={styles.card} aria-labelledby="ageing">
      <Text id="ageing" weight="semibold" size={400} className={styles.chartTitle}>
        Open enquiries by age
      </Text>
      {!ageing.data ? (
        <Spinner size="small" label="Loading" />
      ) : total === 0 ? (
        <Text size={300} className={styles.muted}>
          No open enquiries.
        </Text>
      ) : (
        <div className={styles.split}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={ink.grid} />
              <XAxis dataKey="band" {...axis} interval={0} tickFormatter={shortBand} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip cursor={{ fill: ink.hover }} {...tooltipStyle} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
              <Bar
                dataKey="overdue"
                name="Overdue"
                stackId="a"
                fill={ink.danger}
                stroke={ink.surface}
                strokeWidth={1}
                maxBarSize={40}
              />
              <Bar
                dataKey="onTime"
                name="Not overdue"
                stackId="a"
                fill={ink.brand}
                stroke={ink.surface}
                strokeWidth={1}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className={styles.tableWrap}>
            <Text size={200} weight="semibold" className={mergeClasses(styles.muted, styles.subTitle)}>
              Waiting longest
            </Text>
            <Table size="extra-small" aria-label="Open enquiries waiting longest" style={{ minWidth: 480 }}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell style={{ width: 215 }}>Reference</TableHeaderCell>
                  <TableHeaderCell>Subject</TableHeaderCell>
                  <TableHeaderCell style={{ width: 70 }} className={styles.num}>
                    <span className="w-full text-right">Days</span>
                  </TableHeaderCell>
                  <TableHeaderCell style={{ width: 130 }}>Officer</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ageing.data.oldest.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        {t.reference}
                        {t.isOverdue && (
                          <Badge size="small" appearance="tint" color="danger">
                            Overdue
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block truncate" title={t.subject}>
                        {t.subject || '(no subject)'}
                      </span>
                    </TableCell>
                    <TableCell className={styles.num}>
                      <span className="w-full text-right">{t.ageDays}</span>
                    </TableCell>
                    <TableCell>
                      <span className="block truncate">{t.assignee ?? 'Unassigned'}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}
