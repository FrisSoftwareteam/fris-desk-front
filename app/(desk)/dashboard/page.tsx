'use client';

import { DashboardView } from '@/components/dashboard/DashboardView';
import { OutlookShell } from '@/components/shell/OutlookShell';

// Agent Activity Dashboard (BUILD_SPEC §6.1).
export default function DashboardPage() {
  return (
    <OutlookShell app="dashboard">
      <DashboardView />
    </OutlookShell>
  );
}
