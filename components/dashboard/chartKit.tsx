'use client';

import { useMemo, type ReactNode } from 'react';
import { makeStyles, mergeClasses, Text, tokens, webDarkTheme, type Theme } from '@fluentui/react-components';
import { useAppTheme } from '@/app/providers';

// Pieces shared by the dashboard's cards and charts.

/**
 * Categorical series colours, in fixed order (validated for colour-vision deficiency). The green
 * is lifted on a dark card. Colour follows the officer, never their rank; past eight, the rest
 * fold into "Other".
 */
const SERIES_BEFORE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const SERIES_AFTER = ['#6250d6', '#e34948'];
export const OTHER = '#8a8886';

function chartInk(theme: Theme) {
  return {
    brand: theme.colorBrandBackground,
    grid: theme.colorNeutralStroke2,
    axis: theme.colorNeutralStroke1,
    label: theme.colorNeutralForeground3,
    value: theme.colorNeutralForeground2,
    surface: theme.colorNeutralBackground1,
    hover: theme.colorNeutralBackground1Hover,
    danger: theme.colorPaletteRedBackground3, // overdue (always labelled, never colour alone)
  };
}

/** SVG and Recharts can't use Fluent's CSS variables, so marks take the active theme's values. */
export function useChartChrome() {
  const theme = useAppTheme();
  return useMemo(() => {
    const ink = chartInk(theme);
    const series = [...SERIES_BEFORE, theme === webDarkTheme ? '#3dba54' : '#008300', ...SERIES_AFTER];
    return {
      ink,
      series,
      single: ink.brand,
      axis: {
        tick: { fontSize: 11, fill: ink.label },
        tickLine: false as const,
        axisLine: { stroke: ink.axis },
      },
      tooltipStyle: {
        contentStyle: {
          borderRadius: 6,
          border: `1px solid ${theme.colorNeutralStroke2}`,
          backgroundColor: theme.colorNeutralBackground1,
          color: theme.colorNeutralForeground1,
          boxShadow: tokens.shadow8,
          fontSize: 12,
        },
        labelStyle: { color: theme.colorNeutralForeground1 },
        itemStyle: { color: theme.colorNeutralForeground2 },
      },
      legendText: (value: string) => <span style={{ color: ink.value }}>{value}</span>,
    };
  }, [theme]);
}

/** Working time, e.g. "45m", "3h 20m", "2d 1h" (a working day is the business day's length). */
export function formatWorking(mins: number | null, dayMins: number): string {
  if (mins === null) return '—';
  if (mins < 60) return `${mins}m`;
  if (mins < dayMins) return `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`;
  const days = Math.floor(mins / dayMins);
  const hours = Math.round((mins % dayMins) / 60);
  return `${days}d${hours ? ` ${hours}h` : ''}`;
}

export const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

export const useDashboardStyles = makeStyles({
  root: {
    height: '100%',
    overflowY: 'auto',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  inner: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '1400px',
    marginInline: 'auto',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL} ${tokens.spacingVerticalXXXL}`,
    '@media (max-width: 767px)': { padding: tokens.spacingHorizontalM },
  },
  title: {
    margin: 0,
    fontSize: tokens.fontSizeBase600,
    lineHeight: tokens.lineHeightBase600,
    fontWeight: tokens.fontWeightSemibold,
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalM,
  },
  filter: { minWidth: '180px' },
  filtersEnd: { marginLeft: 'auto' },
  tiles: {
    display: 'grid',
    gap: tokens.spacingHorizontalM,
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
    padding: tokens.spacingHorizontalL,
    minWidth: 0,
  },
  tileValue: {
    display: 'block',
    marginTop: tokens.spacingVerticalXS,
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  danger: { color: tokens.colorPaletteRedForeground1 },
  charts: {
    display: 'grid',
    gap: tokens.spacingHorizontalM,
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))',
  },
  chartTitle: {
    display: 'block',
    marginBottom: tokens.spacingVerticalM,
  },
  tableWrap: { overflowX: 'auto', minWidth: 0 },
  /** A chart beside a table; stacks on narrow screens. */
  split: {
    display: 'grid',
    gap: tokens.spacingHorizontalXL,
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
    alignItems: 'start',
  },
  subTitle: { display: 'block', marginBottom: tokens.spacingVerticalXS },
  cardHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  swatch: { width: '10px', height: '10px', borderRadius: tokens.borderRadiusSmall, flexShrink: 0 },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
});

export function Tile({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: 'danger' }) {
  const styles = useDashboardStyles();
  return (
    <div className={styles.card}>
      <Text size={200} weight="semibold" className={styles.muted}>
        {label}
      </Text>
      <span className={mergeClasses(styles.tileValue, tone === 'danger' && styles.danger)}>{value ?? '…'}</span>
      <Text size={200} className={styles.muted}>
        {hint}
      </Text>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  const styles = useDashboardStyles();
  return (
    <section className={styles.card}>
      <Text weight="semibold" size={400} className={styles.chartTitle}>
        {title}
      </Text>
      {children}
    </section>
  );
}
