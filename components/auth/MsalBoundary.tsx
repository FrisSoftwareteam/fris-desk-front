'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { createMsalInstance } from '@/lib/msal';

const MsalInstanceContext = createContext<PublicClientApplication | null>(null);

/** Wraps children in MsalProvider when Microsoft sign-in is configured; otherwise renders them as-is. */
export function MsalBoundary({ children }: { children: ReactNode }) {
  const [instance] = useState(createMsalInstance);
  if (!instance) return <>{children}</>;
  return (
    <MsalInstanceContext.Provider value={instance}>
      <MsalProvider instance={instance}>{children}</MsalProvider>
    </MsalInstanceContext.Provider>
  );
}

/** The MSAL instance, or null when Microsoft sign-in isn't configured. */
export function useMsalOrNull(): PublicClientApplication | null {
  return useContext(MsalInstanceContext);
}
