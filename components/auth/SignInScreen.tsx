'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMsal } from '@azure/msal-react';
import { CacheLookupPolicy, InteractionStatus } from '@azure/msal-browser';
import { ROLES, type Role, type UserDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { loginRequest } from '@/lib/msal';
import { CompanyLogo } from '@/components/brand/CompanyLogo';
import { useMsalOrNull } from './MsalBoundary';
import { signInFont } from './signInFont';

const ROLE_LABELS: Record<Role, string> = { agent: 'Agent', supervisor: 'Supervisor', admin: 'Admin' };

const fieldClass =
  'h-12 w-full rounded-[10px] border border-[#D3DAE0] bg-white text-[16px] font-normal leading-6 text-[#172033] shadow-[0_1px_2px_rgba(23,32,51,0.06)] outline-none focus:border-[#005082] focus:ring-1 focus:ring-[#005082]';

const primaryClass =
  'mt-4 flex h-12 w-full items-center justify-center rounded-[10px] bg-[#005082] px-4 text-[16px] font-medium leading-6 text-white transition-colors hover:bg-[#00467D] active:bg-[#003976] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#005082] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E7EBEE] disabled:cursor-wait disabled:opacity-70';

/** The signed-out page: the form on the dark left panel, the care desk on the right. */
export function SignInFrame({ children }: { children: ReactNode }) {
  return (
    <div className={`${signInFont.className} flex min-h-dvh w-full bg-[#1E1F22] text-[#FFFFFF] [color-scheme:light]`}>
      <div className="w-full pt-[12vh] pr-6 pb-16 pl-[max(8vw,32px)] lg:w-1/2">
        <h1 className="m-0">
          <CompanyLogo variant="full" className="h-20 w-auto max-w-full" />
        </h1>
        {children}
      </div>
      <div className="relative hidden min-h-dvh lg:block lg:w-1/2">
        <img
          src="/signin/care-desk.jpg"
          alt="An empty customer-care workstation"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    </div>
  );
}

export function SignInScreen({ notice }: { notice?: string }) {
  const authConfig = useQuery({ queryKey: ['auth-config'], queryFn: api.authConfig, retry: 1 });
  const msal = useMsalOrNull();
  const [error, setError] = useState<string | undefined>(notice);

  const queryClient = useQueryClient();
  const onSignedIn = (user: UserDto) => queryClient.setQueryData(['me'], user);

  const microsoftReady = Boolean(msal && authConfig.data?.microsoft);

  return (
    <SignInFrame>
      <p className="mt-6 text-[16px] leading-6 font-normal text-[#5C6B7A]">
        Use your work account to open the shareholder enquiries mailbox.
      </p>

      <div className="mt-10 flex w-full max-w-[24rem] flex-col">
        <h2 className="m-0 text-[20px] leading-6 font-medium">Sign in</h2>

        {error && <p className="mt-4 text-[14px] leading-5 text-[#8C3A3A]">{error}</p>}

        {authConfig.isPending && <p className="mt-4 text-[14px] leading-5 text-[#5C6B7A]">Checking sign-in…</p>}

        {authConfig.isError && <p className="mt-4 text-[14px] leading-5 text-[#8C3A3A]">{authConfig.error.message}</p>}

        {authConfig.data &&
          (microsoftReady ? (
            <MicrosoftSignIn onSignedIn={onSignedIn} onError={setError} />
          ) : (
            <p className="mt-4 text-[14px] leading-5 text-[#5C6B7A]">
              Microsoft sign-in isn&apos;t set up yet. Add the Entra tenant and client IDs to both apps&apos;
              environment files (see README).
            </p>
          ))}

        {authConfig.data?.devLogin && <DevSignIn onSignedIn={onSignedIn} onError={setError} />}
      </div>
    </SignInFrame>
  );
}

interface SignInProps {
  onSignedIn: (user: UserDto) => void;
  onError: (message: string | undefined) => void;
}

/**
 * Redirects to Microsoft, then exchanges the returned access token for an app session.
 * Also completes sign-in automatically when MSAL already holds an account for this tab.
 */
function MicrosoftSignIn({ onSignedIn, onError }: SignInProps) {
  const { instance, accounts, inProgress } = useMsal();
  const [exchanging, setExchanging] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    // Read the cache, not `accounts`: msal-react can still list an account cleared at sign-out.
    const account = instance.getAllAccounts()[0];
    if (inProgress !== InteractionStatus.None || !account || attempted.current) return;
    attempted.current = true;
    setExchanging(true);
    instance
      // Cached tokens only. Without this MSAL falls back to a hidden iframe, which can't complete here
      // (X-Frame-Options: DENY, blocked third-party cookies) and fails after ~10 s with `timed_out`.
      .acquireTokenSilent({ ...loginRequest, account, cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken })
      .then(
        (result) => api.createSession(result.accessToken).then(onSignedIn),
        // No usable Microsoft session: the officer signs in with the button.
        () => undefined,
      )
      .catch((err: unknown) => onError(err instanceof Error ? err.message : 'Sign-in failed. Try again.'))
      .finally(() => setExchanging(false));
  }, [accounts, inProgress, instance, onError, onSignedIn]);

  const busy = exchanging || inProgress !== InteractionStatus.None;
  return (
    <button
      type="button"
      className={primaryClass}
      disabled={busy}
      onClick={() => {
        onError(undefined);
        attempted.current = false;
        // Account picker, so someone who just signed out isn't silently signed back in as before.
        void instance.loginRedirect({ ...loginRequest, prompt: 'select_account' });
      }}
    >
      {busy ? 'Signing you in…' : 'Sign in with Microsoft'}
    </button>
  );
}

/** Sign in as any user and role without Microsoft. Only shown when the API has AUTH_DEV_LOGIN=true. */
function DevSignIn({ onSignedIn, onError }: SignInProps) {
  const [role, setRole] = useState<Role>('agent');
  const [email, setEmail] = useState('dev.agent@registrar.test');
  const [displayName, setDisplayName] = useState('Dev Agent');
  const [busy, setBusy] = useState(false);

  const pickRole = (next: Role) => {
    setRole(next);
    // Keep the sample identity in step with the role unless it has been edited.
    if (email.startsWith('dev.') && email.endsWith('@registrar.test')) setEmail(`dev.${next}@registrar.test`);
    if (displayName.startsWith('Dev ')) setDisplayName(`Dev ${ROLE_LABELS[next]}`);
  };

  return (
    <div className="mt-8">
      <hr className="mb-3 h-px w-full border-0 bg-[#D3DAE0]" />
      <p className="m-0 text-[14px] leading-5 font-normal text-[#5C6B7A]">Local development</p>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          onError(undefined);
          api
            .devLogin({ email, displayName, role })
            .then(onSignedIn)
            .catch((err: Error) => {
              onError(err.message);
              setBusy(false);
            });
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] leading-5">Role</span>
          <span className="relative block">
            <select
              className={`${fieldClass} appearance-none pr-10 pl-3.5`}
              value={role}
              onChange={(e) => pickRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[#5C6B7A]"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 6.5 8 10.5 12 6.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] leading-5">Name</span>
          <input
            className={`${fieldClass} px-3.5`}
            value={displayName}
            required
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] leading-5">Email</span>
          <input
            className={`${fieldClass} px-3.5`}
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-1 self-start bg-transparent px-0 py-1 text-[16px] leading-6 font-medium text-[#5C6B7A] outline-none hover:text-[#005082] focus-visible:underline disabled:opacity-70"
        >
          {busy ? 'Signing in…' : 'Sign in as developer'}
        </button>
      </form>
    </div>
  );
}
