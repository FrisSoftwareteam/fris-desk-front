'use client';

import { useState } from 'react';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { MailboxProvider } from '@/components/mail/MailboxContext';
import { MailView } from '@/components/mail/MailView';
import { OutlookShell } from '@/components/shell/OutlookShell';

export default function HomePage() {
  return (
    <MailboxProvider>
      <MailScreen />
    </MailboxProvider>
  );
}

function MailScreen() {
  const [search, setSearch] = useState('');
  // Typing re-renders only the search box; the (memoised) mail view gets the search once typing pauses.
  const debounced = useDebouncedValue(search, 300);
  return (
    <OutlookShell search={{ value: search, onChange: setSearch, placeholder: 'Search enquiries' }}>
      <MailView search={debounced} />
    </OutlookShell>
  );
}
