'use client';

import { useEffect, useReducer, useState, type ReactElement } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  makeStyles,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Textarea,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownRegular, CalendarClockRegular, CheckmarkRegular, ImportantFilled } from '@fluentui/react-icons';
import {
  PRIORITY_LABELS,
  TICKET_STATUSES,
  type FollowUpDto,
  type StatusReasonDto,
  type TicketListResponse,
  type TicketPatchDto,
  type TicketPriority,
  type TicketStatus,
  type TicketSummaryDto,
} from '@/lib/shared';
import { STATUS_LABELS } from './MailboxContext';

// Pieces shared by the command bar (one enquiry or a selection) and the reading pane:
// priority icons, the status/stage list, and the follow-up menu (GAP_ANALYSIS G-04.2/.3/.7).

const useStyles = makeStyles({
  urgent: { flexShrink: 0, color: tokens.colorPaletteRedForeground1 },
  high: { flexShrink: 0, color: tokens.colorPaletteDarkOrangeForeground1 },
  low: { flexShrink: 0, color: tokens.colorNeutralForeground3 },
  form: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

/** Icon for a non-normal priority (nothing for normal, as Outlook shows nothing for normal importance). */
export function PriorityIcon({ priority }: { priority: TicketPriority }) {
  const styles = useStyles();
  const label = `${PRIORITY_LABELS[priority]} priority`;
  if (priority === 'urgent') return <ImportantFilled className={styles.urgent} aria-label={label} />;
  if (priority === 'high') return <ImportantFilled className={styles.high} aria-label={label} />;
  if (priority === 'low') return <ArrowDownRegular className={styles.low} aria-label={label} />;
  return null;
}

/** One entry in a status picker: a built-in status, or a stage indented under it. */
export interface StatusChoice {
  value: string;
  label: string;
  isStage: boolean;
}

/** Each built-in status followed by its active stages. Values are `status:<s>` or `stage:<id>`. */
export function statusChoices(reasons: StatusReasonDto[]): StatusChoice[] {
  return TICKET_STATUSES.flatMap((s) => [
    { value: `status:${s}`, label: STATUS_LABELS[s], isStage: false },
    ...reasons
      .filter((r) => r.baseStatus === s && r.isActive)
      .map((r) => ({ value: `stage:${r.id}`, label: r.name, isStage: true })),
  ]);
}

export function statusChoiceValue(t: Pick<TicketSummaryDto, 'status' | 'statusReasonId'>): string {
  return t.statusReasonId ? `stage:${t.statusReasonId}` : `status:${t.status}`;
}

/** The patch for a picked status choice. Picking a plain status clears any stage. */
export function patchForStatusChoice(value: string): TicketPatchDto {
  if (value.startsWith('stage:')) return { statusReasonId: value.slice('stage:'.length) };
  return { status: value.slice('status:'.length) as TicketStatus, statusReasonId: null };
}

/** "Awaiting shareholder · Awaiting documents", or just the status. */
export function statusText(
  t: Pick<TicketSummaryDto, 'status' | 'statusReasonId'>,
  reasons: Map<string, StatusReasonDto>,
): string {
  const stage = t.statusReasonId ? reasons.get(t.statusReasonId)?.name : undefined;
  return stage ? `${STATUS_LABELS[t.status]} · ${stage}` : STATUS_LABELS[t.status];
}

// ── Follow-ups ───────────────────────────────────────────────────────────────

function at(days: number, hour: number, from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Quick picks, in the officer's own time zone. */
function quickTimes(now = new Date()): { label: string; at: Date }[] {
  const inThreeHours = new Date(now.getTime() + 3 * 3600_000);
  inThreeHours.setMinutes(0, 0, 0);
  const daysToMonday = (8 - now.getDay()) % 7 || 7;
  return [
    { label: 'In 3 hours', at: inThreeHours },
    { label: 'Tomorrow, 9:00', at: at(1, 9, now) },
    { label: 'Next week (Monday, 9:00)', at: at(daysToMonday, 9, now) },
  ];
}

/** `<input type="datetime-local">` value for a date, in local time. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type FollowUpPatch = NonNullable<TicketPatchDto['followUp']> | null;

interface FollowUpMenuProps {
  /** The current follow-up (one enquiry); undefined for a selection. */
  current?: FollowUpDto | null;
  onChange: (followUp: FollowUpPatch) => void;
  disabled?: boolean;
  /** The menu's trigger button. */
  children: ReactElement;
}

/**
 * Follow up: quick times, a custom time with a note (and optional snooze), or mark complete.
 * Quick picks keep the enquiry in the list; only "Custom…" can hide it until then.
 */
export function FollowUpMenu({ current, onChange, disabled, children }: FollowUpMenuProps) {
  const [custom, setCustom] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger disableButtonEnhancement>{children}</MenuTrigger>
        <MenuPopover>
          <MenuList>
            {quickTimes().map((q) => (
              <MenuItem
                key={q.label}
                disabled={disabled}
                onClick={() => onChange({ at: q.at.toISOString(), note: current?.note ?? '', hide: false })}
              >
                {q.label}
              </MenuItem>
            ))}
            <MenuItem icon={<CalendarClockRegular />} disabled={disabled} onClick={() => setCustom(true)}>
              Custom…
            </MenuItem>
            <MenuDivider />
            <MenuItem
              icon={<CheckmarkRegular />}
              disabled={disabled || current === null}
              onClick={() => onChange(null)}
            >
              Mark complete
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
      <FollowUpDialog
        open={custom}
        current={current ?? null}
        onClose={() => setCustom(false)}
        onSave={(f) => {
          setCustom(false);
          onChange(f);
        }}
      />
    </>
  );
}

function FollowUpDialog({
  open,
  current,
  onClose,
  onSave,
}: {
  open: boolean;
  current: FollowUpDto | null;
  onClose: () => void;
  onSave: (f: NonNullable<FollowUpPatch>) => void;
}) {
  const styles = useStyles();
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [hide, setHide] = useState(false);
  useEffect(() => {
    if (!open) return;
    // Start from the current follow-up if it's still ahead, otherwise tomorrow morning.
    setWhen(toLocalInput(current && !current.isDue ? new Date(current.at) : at(1, 9)));
    setNote(current?.note ?? '');
    setHide(current?.hide ?? false);
  }, [open, current]);

  const date = when ? new Date(when) : null;
  const inPast = Boolean(date && date.getTime() <= Date.now());
  const valid = Boolean(date && !Number.isNaN(date.getTime()) && !inPast);

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSave({ at: date!.toISOString(), note: note.trim(), hide });
          }}
        >
          <DialogBody>
            <DialogTitle>Follow up</DialogTitle>
            <DialogContent className={styles.form}>
              <Field
                label="When"
                required
                validationState={inPast ? 'error' : 'none'}
                validationMessage={inPast ? 'Choose a time in the future' : undefined}
              >
                <Input type="datetime-local" value={when} onChange={(_, d) => setWhen(d.value)} />
              </Field>
              <Field label="Note" hint="For example: call back about the probate documents">
                <Textarea value={note} maxLength={500} onChange={(_, d) => setNote(d.value)} resize="vertical" />
              </Field>
              <Checkbox
                checked={hide}
                onChange={(_, d) => setHide(Boolean(d.checked))}
                label="Hide from the list until then (it comes back unread, or sooner if the shareholder writes)"
              />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button appearance="primary" type="submit" disabled={!valid}>
                Save
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}

// ── Selection ────────────────────────────────────────────────────────────────

/**
 * The list rows for the given ids, read from the cached lists and kept current as those refresh
 * (so a selection's menus show the enquiries' latest categories and read state).
 */
export function useListedTickets(ids: string[]): TicketSummaryDto[] {
  const client = useQueryClient();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const active = ids.length > 0;
  useEffect(() => {
    if (!active) return;
    return client.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.query.queryKey[0] === 'tickets') refresh();
    });
  }, [client, active]);

  if (!active) return [];
  const found = new Map<string, TicketSummaryDto>();
  for (const [, data] of client.getQueriesData<InfiniteData<TicketListResponse>>({ queryKey: ['tickets'] })) {
    for (const page of data?.pages ?? []) for (const t of page.items) if (!found.has(t.id)) found.set(t.id, t);
  }
  return ids.map((id) => found.get(id)).filter((t) => t !== undefined);
}
