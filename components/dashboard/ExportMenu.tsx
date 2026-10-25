'use client';

import { useState } from 'react';
import {
  Button,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Spinner,
} from '@fluentui/react-components';
import { ArrowDownloadRegular } from '@fluentui/react-icons';
import type { ReportExport, ReportQuery } from '@/lib/shared';
import { api } from '@/lib/api';
import { useNotify } from '@/lib/notify';

// CSV downloads of the dashboard with its current filters (GAP_ANALYSIS G-06.2).

const FIGURES: { kind: ReportExport; label: string }[] = [
  { kind: 'agents', label: 'Figures by officer' },
  { kind: 'daily', label: 'Figures by day' },
  { kind: 'breakdown-category', label: 'Figures by category' },
  { kind: 'breakdown-folder', label: 'Figures by folder' },
  { kind: 'ageing', label: 'Open enquiries by age' },
];

export function ExportMenu({ q, isTeamView }: { q: ReportQuery | null; isTeamView: boolean }) {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);

  const run = async (kind: ReportExport) => {
    if (!q) return;
    setBusy(true);
    try {
      await api.exportReport(kind, q);
    } catch (err) {
      notify("Couldn't export", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button icon={busy ? <Spinner size="tiny" /> : <ArrowDownloadRegular />} disabled={!q || busy}>
          Export
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {FIGURES.map((f) => (
            <MenuItem key={f.kind} onClick={() => void run(f.kind)}>
              {f.label}
            </MenuItem>
          ))}
          {/* One row per enquiry with shareholder details: supervisors and admins only. */}
          {isTeamView && (
            <>
              <MenuDivider />
              <MenuItem onClick={() => void run('enquiries')}>Enquiries received in this period</MenuItem>
            </>
          )}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
