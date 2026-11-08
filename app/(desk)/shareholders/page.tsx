'use client';

import { useState } from 'react';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { OutlookShell } from '@/components/shell/OutlookShell';
import { ShareholdersView } from '@/components/shareholders/ShareholdersView';

// Saved shareholder records (GAP_ANALYSIS G-01.1).
export default function ShareholdersPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  return (
    <OutlookShell
      app="shareholders"
      search={{ value: search, onChange: setSearch, placeholder: 'Search shareholders' }}
    >
      <ShareholdersView search={debounced} />
    </OutlookShell>
  );
}
