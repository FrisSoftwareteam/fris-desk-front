'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { useMsalOrNull } from './MsalBoundary';

const CurrentUserContext = createContext<UserDto | null>(null);

export function CurrentUserProvider({ user, children }: { user: UserDto; children: ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

/** The signed-in officer. Only usable inside <AuthGate>. */
export function useCurrentUser(): UserDto {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser must be used inside <AuthGate>');
  return user;
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const msal = useMsalOrNull();
  return useCallback(async () => {
    // Forgets the session token, so /me answers 401 from here on.
    await api.logout();
    // Forget the Microsoft account in this tab so the sign-in screen doesn't silently sign back in.
    await msal?.clearCache().catch(() => undefined);
    msal?.setActiveAccount(null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    // Refetches /me, which now answers 401, so <AuthGate> shows the sign-in screen.
    await queryClient.resetQueries({ queryKey: ['me'] });
  }, [msal, queryClient]);
}
