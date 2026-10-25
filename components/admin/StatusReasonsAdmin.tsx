'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dropdown,
  Field,
  Input,
  Option,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@fluentui/react-components';
import { DeleteRegular, EditRegular } from '@fluentui/react-icons';
import { TICKET_STATUSES, type StatusReasonDto, type TicketStatus } from '@/lib/shared';
import { api } from '@/lib/api';
import { queryKeys, STATUS_LABELS } from '@/components/mail/MailboxContext';
import { ConfirmDelete, EditDialog, ListState, SectionHeader, useAdminStyles, useAdminWrite } from './common';

type StageForm = Omit<StatusReasonDto, 'id'>;

/** Admin → Statuses: local stages within the built-in statuses (GAP_ANALYSIS G-04.7). */
export function StatusReasonsAdmin() {
  const styles = useAdminStyles();
  const reasons = useQuery({ queryKey: queryKeys.statusReasons, queryFn: api.statusReasons });
  const write = useAdminWrite(queryKeys.statusReasons, ['tickets']);
  const [editing, setEditing] = useState<{ id: string | null; form: StageForm } | null>(null);
  const [deleting, setDeleting] = useState<StatusReasonDto | null>(null);
  // Grouped by status in the order officers see them.
  const list = [...(reasons.data ?? [])].sort(
    (a, b) =>
      TICKET_STATUSES.indexOf(a.baseStatus) - TICKET_STATUSES.indexOf(b.baseStatus) ||
      a.order - b.order ||
      a.name.localeCompare(b.name),
  );

  const save = async () => {
    if (!editing) return;
    const name = editing.form.name.trim();
    if (!name) throw new Error('Enter a name for the stage');
    await write.mutateAsync(() =>
      editing.id
        ? api.admin.statusReasons.update(editing.id, {
            name,
            order: editing.form.order,
            isActive: editing.form.isActive,
          })
        : api.admin.statusReasons.create({ ...editing.form, name }),
    );
  };

  return (
    <>
      <SectionHeader
        title="Statuses"
        description="The six statuses are built in, because the SLA clock, reopening on new mail and the reports depend on them. Add your own stages under a status, for example “Awaiting documents” under Awaiting shareholder. A stage behaves like its status."
        addLabel="New stage"
        onAdd={() =>
          setEditing({ id: null, form: { name: '', baseStatus: 'awaiting_shareholder', order: 0, isActive: true } })
        }
      />
      <ListState query={reasons} empty={list.length === 0}>
        <Table size="small" aria-label="Stages" style={{ minWidth: 520 }}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Stage</TableHeaderCell>
              <TableHeaderCell style={{ width: 200 }}>Under status</TableHeaderCell>
              <TableHeaderCell style={{ width: 80 }}>Order</TableHeaderCell>
              <TableHeaderCell style={{ width: 96 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <span className={r.isActive ? undefined : styles.inactive}>{r.name}</span>{' '}
                  {!r.isActive && (
                    <Badge appearance="outline" color="subtle">
                      Retired
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{STATUS_LABELS[r.baseStatus]}</TableCell>
                <TableCell>{r.order}</TableCell>
                <TableCell>
                  <div className={styles.rowActions}>
                    <Button
                      appearance="subtle"
                      icon={<EditRegular />}
                      aria-label={`Edit ${r.name}`}
                      onClick={() => setEditing({ id: r.id, form: { ...r } })}
                    />
                    <Button
                      appearance="subtle"
                      icon={<DeleteRegular />}
                      aria-label={`Delete ${r.name}`}
                      onClick={() => setDeleting(r)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListState>

      <EditDialog
        open={editing !== null}
        title={editing?.id ? 'Edit stage' : 'New stage'}
        onClose={() => setEditing(null)}
        onSave={save}
      >
        {editing && (
          <>
            <Field label="Name" required>
              <Input
                value={editing.form.name}
                maxLength={60}
                autoFocus
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, name: d.value } })}
              />
            </Field>
            <Field
              label="Under status"
              hint={editing.id ? 'Fixed once created; make a new stage for a different status.' : undefined}
            >
              <Dropdown
                disabled={Boolean(editing.id)}
                value={STATUS_LABELS[editing.form.baseStatus]}
                selectedOptions={[editing.form.baseStatus]}
                onOptionSelect={(_, d) =>
                  setEditing({ ...editing, form: { ...editing.form, baseStatus: d.optionValue as TicketStatus } })
                }
              >
                {TICKET_STATUSES.map((s) => (
                  <Option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Order" hint="Lower numbers come first under the status.">
              <Input
                type="number"
                min={0}
                value={String(editing.form.order)}
                onChange={(_, d) =>
                  setEditing({ ...editing, form: { ...editing.form, order: Math.max(0, Number(d.value) || 0) } })
                }
              />
            </Field>
            <Switch
              label="In use (retired stages stay on enquiries that have them but can't be chosen)"
              checked={editing.form.isActive}
              onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, isActive: d.checked } })}
            />
          </>
        )}
      </EditDialog>

      <ConfirmDelete
        what={deleting && `the stage “${deleting.name}”`}
        consequence="Enquiries at this stage keep their status. To keep the history readable, consider retiring it instead."
        onClose={() => setDeleting(null)}
        onConfirm={() => write.mutateAsync(() => api.admin.statusReasons.remove(deleting!.id)).then(() => undefined)}
      />
    </>
  );
}
