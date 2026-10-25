'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { onTokenChangedElsewhere } from '@/lib/session';
import { MsalBoundary } from './MsalBoundary';
import { CurrentUserProvider } from './CurrentUser';
import { SignInFrame, SignInScreen } from './SignInScreen';

/** Shows the sign-in screen until the API confirms a session, then renders the app as that user. */
export function AuthGate({ children }: { children: ReactNode }) {
  // Everything behind the gate depends on the browser session, so render it client-side only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Splash />;

  return (
    <MsalBoundary>
      <Session>{children}</Session>
    </MsalBoundary>
  );
}

function Session({ children }: { children: ReactNode }) {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const client = useQueryClient();
  // Signing in or out in another tab: start again here as whoever that tab is now.
  useEffect(
    () =>
      onTokenChangedElsewhere(() => {
        client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        void client.resetQueries({ queryKey: ['me'] });
      }),
    [client],
  );

  if (me.isPending) return <Splash />;
  const err = me.error;
  // Checked before `me.data`: after the session expires, a re-check fails but the old data stays.
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return (
      <SignInScreen
        notice={err.status === 403 ? err.message : me.data ? 'Your session has ended. Sign in again.' : undefined}
      />
    );
  }
  if (me.data) return <CurrentUserProvider user={me.data}>{children}</CurrentUserProvider>;

  return (
    <SignInFrame>
      <p className="mt-6 max-w-[24rem] text-[16px] leading-6 text-[#172033]">
        Registrar Desk can&apos;t load right now
      </p>
      {err?.message && <p className="mt-2 max-w-[24rem] text-[14px] leading-5 text-[#5C6B7A]">{err.message}</p>}
      <button
        type="button"
        className="mt-6 h-12 max-w-[24rem] rounded-lg bg-[#0F6E6A] px-4 text-[16px] font-medium text-white hover:bg-[#0C5C58] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F6E6A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E6EDF2]"
        onClick={() => void me.refetch()}
      >
        Try again
      </button>
    </SignInFrame>
  );
}

function Splash() {
  return (
    <SignInFrame>
      <p className="mt-6 text-[16px] leading-6 text-[#5C6B7A]">Loading Registrar Desk</p>
    </SignInFrame>
  );
}
