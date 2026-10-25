'use client';

import { Suspense } from 'react';
import { AdminView } from '@/components/admin/AdminView';
import { OutlookShell } from '@/components/shell/OutlookShell';

// Admin screens (BUILD_SPEC §8.4). The section is in the URL (?section=…) so it survives a refresh.
export default function AdminPage() {
  return (
    <OutlookShell app="admin">
      {/* useSearchParams needs a Suspense boundary in the App Router. */}
      <Suspense>
        <AdminView />
      </Suspense>
    </OutlookShell>
  );
}
