'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AgentReportDto, AgentRowDto, ReportQuery } from '@/lib/shared';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { AgeingCard } from './AgeingCard';
import { BreakdownCard } from './BreakdownCard';
import { ChartCard, formatWorking, OTHER, pct, Tile, useChartChrome, useDashboardStyles } from './chartKit';
import { ExportMenu } from './ExportMenu';

// Agent Activity Dashboard (BUILD_SPEC §6.1). Supervisors and admins see the team; an agent sees
// only their own figures (the API enforces that too).

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom range' },
];

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** [from, to) in the officer's local time; `to` is the start of the day after the last one shown. */
function rangeFor(preset: Preset, custom: { from: string; to: string }): { from: Date; to: Date } | null {
  const today = dayStart(new Date());
  const tomorrow = addDays(today, 1);
  switch (preset) {
    case 'today':
      return { from: today, to: tomorrow };
    case '7d':
      return { from: addDays(today, -6), to: tomorrow };
    case '30d':
      return { from: addDays(today, -29), to: tomorrow };
    case 'month':
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: tomorrow };
    case 'custom': {
      if (!custom.from || !custom.to) return null;
      const from = new Date(`${custom.from}T00:00`);
      const to = addDays(new Date(`${custom.to}T00:00`), 1);
      return to > from ? { from, to } : null;
    }
  }
}

const shortDay = (day: string) =>
  new Date(`${day}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function DashboardView() {
  const styles = useDashboardStyles();
  const { ink, series, axis, tooltipStyle, legendText, single } = useChartChrome();
  const user = useCurrentUser();
  const isTeamView = user.role !== 'agent';
  const [preset, setPreset] = useState<Preset>('7d');
  const [custom, setCustom] = useState({ from: isoDate(addDays(new Date(), -13)), to: isoDate(new Date()) });
  const [agentId, setAgentId] = useState('');
  const [folderId, setFolderId] = useState('');

  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders, staleTime: 5 * 60_000 });
  const staff = useQuery({ queryKey: ['users'], queryFn: api.users, staleTime: 5 * 60_000, enabled: isTeamView });

  const range = rangeFor(preset, custom);
  const q: ReportQuery | null = range && {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    agentId: agentId || undefined,
    folderId: folderId || undefined,
  };
  const summary = useQuery({
    queryKey: ['report-summary', q],
    queryFn: () => api.reportSummary(q!),
    enabled: Boolean(q),
    refetchInterval: 60_000,
  });
  const agents = useQuery({
    queryKey: ['report-agents', q],
    queryFn: () => api.reportAgents(q!),
    enabled: Boolean(q),
    refetchInterval: 60_000,
  });

  const report = agents.data;
  const bh = report?.businessHours;
  const dayMins = bh
    ? Number(bh.end.slice(0, 2)) * 60 +
      Number(bh.end.slice(3)) -
      Number(bh.start.slice(0, 2)) * 60 -
      Number(bh.start.slice(3))
    : 540;
  const error = summary.error ?? agents.error;

  return (
    <div className={styles.root}>
      <div className={styles.inner}>
        <div className="flex flex-col gap-1">
          <h1 className={styles.title}>{isTeamView ? 'Agent activity' : 'My activity'}</h1>
          <Text size={200} className={styles.muted}>
            Response and resolution times count working hours only
            {bh ? ` (${bh.start}–${bh.end}, ${bh.tz.replace('_', ' ')})` : ''}. Figures refresh every minute.
          </Text>
        </div>

        <div className={styles.filters} role="group" aria-label="Filters">
          <Field label="Date range" className={styles.filter}>
            <Dropdown
              value={PRESETS.find((p) => p.id === preset)?.label}
              selectedOptions={[preset]}
              onOptionSelect={(_, d) => setPreset(d.optionValue as Preset)}
            >
              {PRESETS.map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.label}
                </Option>
              ))}
            </Dropdown>
          </Field>
          {preset === 'custom' && (
            <>
              <Field label="From">
                <Input
                  type="date"
                  value={custom.from}
                  max={custom.to}
                  onChange={(_, d) => setCustom((c) => ({ ...c, from: d.value }))}
                />
              </Field>
              <Field label="To">
                <Input
                  type="date"
                  value={custom.to}
                  min={custom.from}
                  onChange={(_, d) => setCustom((c) => ({ ...c, to: d.value }))}
                />
              </Field>
            </>
          )}
          {isTeamView && (
            <Field label="Officer" className={styles.filter}>
              <Dropdown
                value={staff.data?.find((s) => s.id === agentId)?.displayName ?? 'All officers'}
                selectedOptions={[agentId]}
                onOptionSelect={(_, d) => setAgentId(d.optionValue ?? '')}
              >
                <Option value="">All officers</Option>
                {(staff.data ?? []).map((s) => (
                  <Option key={s.id} value={s.id}>
                    {s.displayName}
                  </Option>
                ))}
              </Dropdown>
            </Field>
          )}
          <Field label="Folder" className={styles.filter}>
            <Dropdown
              value={folders.data?.find((f) => f.id === folderId)?.name ?? 'All folders'}
              selectedOptions={[folderId]}
              onOptionSelect={(_, d) => setFolderId(d.optionValue ?? '')}
            >
              <Option value="">All folders</Option>
              {(folders.data ?? []).map((f) => (
                <Option key={f.id} value={f.id}>
                  {f.name}
                </Option>
              ))}
            </Dropdown>
          </Field>
          {(summary.isFetching || agents.isFetching) && <Spinner size="tiny" />}
          <div className={styles.filtersEnd}>
            <ExportMenu q={q} isTeamView={isTeamView} />
          </div>
        </div>

        {!range && (
          <MessageBar intent="warning">
            <MessageBarBody>Choose a start date on or before the end date.</MessageBarBody>
          </MessageBar>
        )}
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error.message}</MessageBarBody>
          </MessageBar>
        )}

        <div className={styles.tiles}>
          <Tile label="Enquiries received" value={summary.data?.received} hint={originHint(summary.data?.byOrigin)} />
          <Tile label="Open now" value={summary.data?.openNow} hint="Not yet resolved" />
          <Tile label="Resolved" value={summary.data?.resolved} hint="In this period" />
          <Tile
            label="Overdue now"
            value={summary.data?.overdueNow}
            hint="Past their SLA"
            tone={summary.data?.overdueNow ? 'danger' : undefined}
          />
          <Tile
            label="Avg first response"
            value={summary.data && formatWorking(summary.data.avgFirstResponseMins, dayMins)}
            hint="Working time to first reply"
          />
          <Tile
            label="Resolved within SLA"
            value={summary.data && pct(summary.data.slaMetPct)}
            hint="Of those resolved"
          />
        </div>

        <section className={styles.card} aria-labelledby="per-agent">
          <Text id="per-agent" weight="semibold" size={400} className={styles.chartTitle}>
            {isTeamView ? 'By officer' : 'Your figures'}
          </Text>
          <AgentTable rows={report?.agents} dayMins={dayMins} loading={agents.isPending && Boolean(q)} />
        </section>

        <AgeingCard q={q} />
        <BreakdownCard q={q} dayMins={dayMins} />

        {report && (
          <div className={styles.charts}>
            <ChartCard title="Assignments per day">
              <AssignmentsPerDay report={report} />
            </ChartCard>
            <ChartCard title="Assignments by hour of day">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={report.assignmentsByHour} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={ink.grid} />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(h: number) => String(h).padStart(2, '0')}
                    {...axis}
                    interval={1}
                  />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip
                    cursor={{ fill: ink.hover }}
                    labelFormatter={(h) => `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59`}
                    formatter={(v) => [v, 'Assignments']}
                    {...tooltipStyle}
                  />
                  <Bar dataKey="total" name="Assignments" fill={single} radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Received vs resolved">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={report.receivedVsResolved} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={ink.grid} />
                  <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={16} />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip labelFormatter={(d) => shortDay(String(d))} {...tooltipStyle} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
                  <Line
                    type="linear"
                    dataKey="received"
                    name="Received"
                    stroke={series[0]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="linear"
                    dataKey="resolved"
                    name="Resolved"
                    stroke={series[1]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            {isTeamView && (
              <ChartCard title="Workload now (open enquiries)">
                <Workload rows={report.agents} />
              </ChartCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function originHint(byOrigin: Record<string, number> | undefined): string {
  if (!byOrigin) return '';
  const parts = [
    byOrigin.email && `${byOrigin.email} email`,
    byOrigin.phone && `${byOrigin.phone} phone`,
    byOrigin.walk_in && `${byOrigin.walk_in} walk-in`,
  ].filter(Boolean);
  return parts.join(' · ') || 'None in this period';
}

function AgentTable({
  rows,
  dayMins,
  loading,
}: {
  rows: AgentRowDto[] | undefined;
  dayMins: number;
  loading: boolean;
}) {
  const styles = useDashboardStyles();
  if (loading) return <Spinner size="small" label="Loading figures" />;
  if (!rows?.length) {
    return (
      <Text size={300} className={styles.muted}>
        No officers to show yet. Officers appear here after they first sign in.
      </Text>
    );
  }
  const cols: [string, (r: AgentRowDto) => ReactNode][] = [
    ['Open now', (r) => r.openNow],
    ['Assigned', (r) => r.assigned],
    ['Resolved', (r) => r.resolved],
    ['Replies sent', (r) => r.repliesSent],
    ['Avg first response', (r) => formatWorking(r.avgFirstResponseMins, dayMins)],
    ['Avg resolution', (r) => formatWorking(r.avgResolutionMins, dayMins)],
    ['Overdue now', (r) => (r.overdueNow ? <span className={styles.danger}>{r.overdueNow}</span> : 0)],
    ['SLA met', (r) => pct(r.slaMetPct)],
  ];
  return (
    <div className={styles.tableWrap}>
      <Table size="small" aria-label="Figures by officer" style={{ minWidth: 860 }}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Officer</TableHeaderCell>
            {cols.map(([name]) => (
              <TableHeaderCell key={name} className={styles.num}>
                <span className="w-full text-right">{name}</span>
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.agentId}>
              <TableCell>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Avatar name={r.displayName} size={24} color="colorful" />
                  {r.displayName}
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
  );
}

/** Stacked by officer. Colours are fixed by officer (table order), so filters never repaint them. */
function AssignmentsPerDay({ report }: { report: AgentReportDto }) {
  const { ink, series: palette, axis, tooltipStyle, legendText } = useChartChrome();
  const { series, data } = useMemo(() => {
    const named = report.agents.slice(0, palette.length);
    const shown = new Set(named.map((a) => a.agentId));
    const hasOther = report.assignmentsByDay.some((d) => Object.keys(d.byAgent).some((id) => !shown.has(id)));
    const data = report.assignmentsByDay.map((d) => {
      const row: Record<string, number | string> = { day: d.day };
      let other = 0;
      for (const [id, n] of Object.entries(d.byAgent)) {
        if (shown.has(id)) row[id] = n;
        else other += n;
      }
      if (hasOther) row.other = other;
      return row;
    });
    const series = [
      ...named.map((a, i) => ({ key: a.agentId, name: a.displayName, color: palette[i]! })),
      ...(hasOther ? [{ key: 'other', name: 'Other officers', color: OTHER }] : []),
    ];
    return { series, data };
  }, [palette, report]);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={ink.grid} />
        <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={16} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip cursor={{ fill: ink.hover }} labelFormatter={(d) => shortDay(String(d))} {...tooltipStyle} />
        {series.length > 1 && <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="a"
            fill={s.color}
            // A 2px surface gap between stacked segments; rounded data end on the top segment.
            stroke={ink.surface}
            strokeWidth={1}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            maxBarSize={32}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function Workload({ rows }: { rows: AgentRowDto[] }) {
  const { ink, axis, tooltipStyle, single } = useChartChrome();
  const data = [...rows].sort((a, b) => b.openNow - a.openNow).map((r) => ({ name: r.displayName, open: r.openNow }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 32 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={ink.grid} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="name" width={130} {...axis} />
        <Tooltip cursor={{ fill: ink.hover }} formatter={(v) => [v, 'Open']} {...tooltipStyle} />
        <Bar
          dataKey="open"
          name="Open"
          fill={single}
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          label={{ position: 'right', fontSize: 11, fill: ink.value }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
