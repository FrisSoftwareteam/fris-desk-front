'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  Combobox,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
  Textarea,
  tokens,
} from '@fluentui/react-components';
import { PeopleTeamRegular, PersonRegular } from '@fluentui/react-icons';
import type { DepartmentDto, TicketDetailDto } from '@/lib/shared';
import { api } from '@/lib/api';

/** Keep the open list inside the viewport, and no taller than the dialog can comfortably show. */
function capEscalateList(e: { currentTarget: EventTarget | null }) {
  const el = e.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  const cap = Math.min(280, window.innerHeight * 0.4);
  const applied = Number.parseFloat(el.style.maxHeight);
  el.style.maxHeight = `${Number.isFinite(applied) ? Math.min(applied, cap) : cap}px`;
}

interface EscalateDialogProps {
  ticket: TicketDetailDto;
  departments: DepartmentDto[];
  /** The team chosen from the Escalate menu; null opens with nothing chosen. */
  departmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEscalated: (ticket: TicketDetailDto) => void;
}

/**
 * Forwards the enquiry's thread from the shared mailbox to a team or person in the escalation
 * directory, with the officer's note on top, and marks the enquiry escalated (BUILD_SPEC §6, §7).
 */
export function EscalateDialog({
  ticket,
  departments,
  departmentId,
  open,
  onOpenChange,
  onEscalated,
}: EscalateDialogProps) {
  const [chosen, setChosen] = useState<string | null>(departmentId);
  const [deptQuery, setDeptQuery] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setChosen(departmentId);
      setDeptQuery('');
      setError(null);
    }
  }, [open, departmentId]);

  const department = departments.find((d) => d.id === chosen);
  const deptQueryText = deptQuery.trim().toLowerCase();
  const visibleDepartments = departments.filter(
    (d) =>
      !deptQueryText ||
      [d.name, d.email, d.description].some((part) => part.toLowerCase().includes(deptQueryText)),
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!department) {
      setError('Choose who to escalate to');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const updated = await api.escalate(ticket.id, { departmentId: department.id, note });
      setNote('');
      onEscalated(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !sending && onOpenChange(d.open)}>
      <DialogSurface aria-describedby={undefined} style={{ maxWidth: 560 }}>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <DialogBody>
            <DialogTitle>Escalate {ticket.reference}</DialogTitle>
            <DialogContent className="flex flex-col gap-3">
              {error && (
                <MessageBar intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
              <Field label="Escalate to" required>
                <Combobox
                  placeholder="Choose a team or person"
                  style={{ width: '100%', minWidth: 0 }}
                  selectedOptions={chosen ? [chosen] : []}
                  onChange={(e) => setDeptQuery(e.target.value)}
                  onOptionSelect={(_, data) => {
                    if (!data.optionValue || data.optionValue === 'no-matches') {
                      setChosen(null);
                      return;
                    }
                    setChosen(data.optionValue);
                    setDeptQuery('');
                  }}
                  onOpenChange={(_, data) => {
                    if (!data.open) setDeptQuery('');
                  }}
                  positioning={{
                    autoSize: 'height',
                    overflowBoundaryPadding: 8,
                    onPositioningEnd: capEscalateList,
                  }}
                  listbox={{ style: { maxHeight: 'min(280px, 40vh)' } }}
                >
                  {visibleDepartments.map((d) => (
                    <Option key={d.id} value={d.id} text={d.name}>
                      <span className="flex items-center gap-2">
                        {d.type === 'person' ? <PersonRegular /> : <PeopleTeamRegular />}
                        <span className="flex flex-col">
                          <span>{d.name}</span>
                          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                            {d.email}
                          </Text>
                        </span>
                      </span>
                    </Option>
                  ))}
                  {departments.length > 0 && visibleDepartments.length === 0 && (
                    <Option disabled value="no-matches" text="No matches">
                      No matches
                    </Option>
                  )}
                </Combobox>
              </Field>
              {department?.description && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {department.description}
                </Text>
              )}
              <Field
                label="Note"
                hint="Goes above the forwarded emails, and is kept on the enquiry as an internal note."
              >
                <Textarea
                  value={note}
                  onChange={(_, d) => setNote(d.value)}
                  rows={5}
                  resize="vertical"
                  placeholder="What do you need from them?"
                />
              </Field>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                The whole thread is forwarded from the shared mailbox
                {department ? ` to ${department.email}${department.cc ? ` (cc ${department.cc})` : ''}` : ''}, and the enquiry is marked Escalated.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" type="button" onClick={() => onOpenChange(false)} disabled={sending}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                type="submit"
                disabled={sending || !department}
                icon={sending ? <Spinner size="tiny" /> : undefined}
              >
                {sending ? 'Escalating…' : 'Escalate'}
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}
