'use client';

import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider';

// The signed-in screens (mail, dashboard, admin) share one sign-in check and one live connection,
// so moving between them doesn't reconnect, and the notification bell gets live pushes on each.
export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <RealtimeProvider>{children}</RealtimeProvider>
    </AuthGate>
  );
}
