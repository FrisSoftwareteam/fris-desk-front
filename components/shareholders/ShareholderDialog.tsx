'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Input, Text, Textarea, Tooltip } from '@fluentui/react-components';
import { AddRegular, DeleteRegular } from '@fluentui/react-icons';
import { useQueryClient } from '@tanstack/react-query';
import type { ShareholderDto, ShareholderHoldingDto, ShareholderInput } from '@/lib/shared';
import { api } from '@/lib/api';
import { ConfirmDelete, EditDialog } from '@/components/admin/common';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { queryKeys } from '@/components/mail/MailboxContext';

const EMPTY_HOLDING: ShareholderHoldingDto = { company: '', chn: '', cscsNumber: '' };

interface ShareholderDialogProps {
  open: boolean;
  /** The saved record to edit; null to add a new one. */
  record: ShareholderDto | null;
  /** Starting values for a new record (e.g. the enquiry's sender). */
  prefill?: Partial<ShareholderInput>;
  onClose: () => void;
}

/** Add or edit a saved shareholder record (G-01.1). Admins can also delete it. */
export function ShareholderDialog({ open, record, prefill, onClose }: ShareholderDialogProps) {
  const client = useQueryClient();
  const isAdmin = useCurrentUser().role === 'admin';
  const [form, setForm] = useState<ShareholderInput>(() => initial(record, prefill));
  const [confirming, setConfirming] = useState(false);

  // Start from the record (or prefill) each time the dialog opens.
  useEffect(() => {
    if (open) setForm(initial(record, prefill));
  }, [open, record?.id]);

  const set = (key: 'name' | 'email' | 'phone' | 'address') => (_: unknown, d: { value: string }) =>
    setForm((f) => ({ ...f, [key]: d.value }));
  const setHolding = (i: number, key: keyof ShareholderHoldingDto, value: string) =>
    setForm((f) => ({ ...f, holdings: f.holdings.map((h, j) => (j === i ? { ...h, [key]: value } : h)) }));
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.shareholders });

  const save = async () => {
    if (!form.name.trim()) throw new Error('Enter the shareholder’s name');
    const body = { ...form, email: form.email.trim() };
    await (record ? api.shareholders.update(record.id, body) : api.shareholders.create(body));
    await refresh();
  };

  return (
    <>
      <EditDialog
        open={open && !confirming}
        title={record ? 'Shareholder record' : 'Save shareholder'}
        onClose={onClose}
        onSave={save}
        wide
      >
        <Field label="Name" required>
          <Input value={form.name} onChange={set('name')} autoFocus={!form.name} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" hint="One record per email address">
            <Input type="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={form.phone} onChange={set('phone')} />
          </Field>
        </div>
        <Field label="Address">
          <Textarea value={form.address} onChange={set('address')} resize="vertical" rows={2} />
        </Field>

        <Text weight="semibold">Holdings</Text>
        {form.holdings.map((h, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Field label={i === 0 ? 'Company' : undefined}>
              <Input aria-label="Company" value={h.company} onChange={(_, d) => setHolding(i, 'company', d.value)} />
            </Field>
            <Field label={i === 0 ? 'CHN' : undefined}>
              <Input aria-label="CHN" value={h.chn} onChange={(_, d) => setHolding(i, 'chn', d.value)} />
            </Field>
            <Field label={i === 0 ? 'CSCS number' : undefined}>
              <Input
                aria-label="CSCS number"
                value={h.cscsNumber}
                onChange={(_, d) => setHolding(i, 'cscsNumber', d.value)}
              />
            </Field>
            <Tooltip content="Remove this holding" relationship="label">
              <Button
                appearance="subtle"
                icon={<DeleteRegular />}
                onClick={() => setForm((f) => ({ ...f, holdings: f.holdings.filter((_, j) => j !== i) }))}
              />
            </Tooltip>
          </div>
        ))}
        <div className="flex justify-between">
          <Button
            appearance="subtle"
            icon={<AddRegular />}
            onClick={() => setForm((f) => ({ ...f, holdings: [...f.holdings, EMPTY_HOLDING] }))}
          >
            Add company
          </Button>
          {record && isAdmin && (
            <Button appearance="subtle" icon={<DeleteRegular />} onClick={() => setConfirming(true)}>
              Delete record
            </Button>
          )}
        </div>
      </EditDialog>

      <ConfirmDelete
        what={confirming && record ? `the saved record for ${record.name}` : null}
        consequence="Enquiries are not affected."
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await api.shareholders.remove(record!.id);
          await refresh();
          onClose();
        }}
      />
    </>
  );
}

function initial(record: ShareholderDto | null, prefill?: Partial<ShareholderInput>): ShareholderInput {
  const base = record ?? { name: '', email: '', phone: '', address: '', holdings: [], ...prefill };
  return {
    name: base.name ?? '',
    email: base.email ?? '',
    phone: base.phone ?? '',
    address: base.address ?? '',
    holdings: base.holdings?.length ? base.holdings : [EMPTY_HOLDING],
  };
}
