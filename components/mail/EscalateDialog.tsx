'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
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
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setChosen(departmentId);
      setError(null);
    }
  }, [open, departmentId]);

  const department = departments.find((d) => d.id === chosen);

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
                <Dropdown
                  placeholder="Choose a team or person"
                  value={department?.name ?? ''}
                  selectedOptions={chosen ? [chosen] : []}
                  onOptionSelect={(_, d) => setChosen(d.optionValue ?? null)}
                >
                  {departments.map((d) => (
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
                </Dropdown>
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
                {department ? ` to ${department.email}` : ''}, and the enquiry is marked Escalated.
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
