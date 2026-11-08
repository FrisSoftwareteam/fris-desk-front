'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  tokens,
} from '@fluentui/react-components';
import type { ShareholderDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { ListState, SectionHeader } from '@/components/admin/common';
import { queryKeys } from '@/components/mail/MailboxContext';
import { ShareholderDialog } from './ShareholderDialog';

/** Look up saved shareholder records by name, email, phone, address, company, CHN or CSCS number. */
export function ShareholdersView({ search }: { search: string }) {
  const q = search.trim();
  const list = useQuery({ queryKey: queryKeys.shareholderSearch(q), queryFn: () => api.shareholders.search(q) });
  // undefined = closed; null = adding a new record.
  const [open, setOpen] = useState<ShareholderDto | null | undefined>(undefined);
  const rows = list.data ?? [];
  const join = (s: ShareholderDto, key: 'company' | 'chn' | 'cscsNumber') =>
    s.holdings
      .map((h) => h[key])
      .filter(Boolean)
      .join(', ');

  return (
    <div style={{ padding: tokens.spacingHorizontalL, overflowY: 'auto', height: '100%' }}>
      <SectionHeader
        title="Shareholders"
        description={
          q
            ? `Saved records matching “${q}” (up to 50).`
            : 'Saved shareholder records, most recently updated first. Search above by name, email, phone, company, CHN or CSCS number.'
        }
        addLabel="New shareholder"
        onAdd={() => setOpen(null)}
      />
      <ListState query={list} empty={rows.length === 0}>
        <Table size="small" aria-label="Shareholders" style={{ minWidth: 860 }}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Phone</TableHeaderCell>
              <TableHeaderCell>Companies</TableHeaderCell>
              <TableHeaderCell>CHN</TableHeaderCell>
              <TableHeaderCell>CSCS number</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow
                key={s.id}
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                onClick={() => setOpen(s)}
                onKeyDown={(e) => e.key === 'Enter' && setOpen(s)}
              >
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.email}</TableCell>
                <TableCell>{s.phone}</TableCell>
                <TableCell>{join(s, 'company')}</TableCell>
                <TableCell>{join(s, 'chn')}</TableCell>
                <TableCell>{join(s, 'cscsNumber')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListState>
      <ShareholderDialog open={open !== undefined} record={open ?? null} onClose={() => setOpen(undefined)} />
    </div>
  );
}
