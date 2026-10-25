'use client';

import { Badge, Tooltip } from '@fluentui/react-components';
import { ClockAlarmRegular, ClockRegular } from '@fluentui/react-icons';
import { formatDuration, formatFullDateTime } from '@/lib/format';

/** Within this share of the SLA window (or under 4 hours), the chip turns amber. */
const AMBER_FRACTION = 0.25;
const AMBER_MIN_MS = 4 * 3_600_000;

type Band = 'ok' | 'soon' | 'overdue';

export function slaBand(createdAt: string, dueAt: string, now = Date.now()): Band {
  const due = new Date(dueAt).getTime();
  const remaining = due - now;
  if (remaining <= 0) return 'overdue';
  const window = due - new Date(createdAt).getTime();
  return remaining < Math.max(window * AMBER_FRACTION, AMBER_MIN_MS) ? 'soon' : 'ok';
}

const BAND_COLOR = { ok: 'success', soon: 'warning', overdue: 'danger' } as const;

/** SLA countdown that moves green → amber → red as the response deadline approaches. */
export function SlaChip({ createdAt, dueAt }: { createdAt: string; dueAt: string | null }) {
  if (!dueAt) return null;
  const band = slaBand(createdAt, dueAt);
  const remaining = new Date(dueAt).getTime() - Date.now();
  const label = band === 'overdue' ? `Overdue by ${formatDuration(remaining)}` : `Due in ${formatDuration(remaining)}`;

  return (
    <Tooltip content={`Response due ${formatFullDateTime(dueAt)}`} relationship="description">
      <Badge
        appearance="tint"
        color={BAND_COLOR[band]}
        shape="rounded"
        size="medium"
        icon={band === 'overdue' ? <ClockAlarmRegular /> : <ClockRegular />}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
