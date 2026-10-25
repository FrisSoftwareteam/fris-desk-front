'use client';

import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import {
  createDOMRenderer,
  FluentProvider,
  RendererProvider,
  renderToStyleElements,
  SSRProvider,
  Toaster,
  webDarkTheme,
  webLightTheme,
  type Theme,
} from '@fluentui/react-components';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { TOASTER_ID } from '@/lib/notify';

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function subscribeToColorScheme(onChange: () => void) {
  const media = window.matchMedia(COLOR_SCHEME_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function systemTheme(): Theme {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? webDarkTheme : webLightTheme;
}

/** Fluent theme for the signed-in desk: the system setting, dark on the server until the client knows. */
export function useAppTheme(): Theme {
  return useSyncExternalStore(subscribeToColorScheme, systemTheme, () => webDarkTheme);
}

// Fluent UI v9 + Next.js App Router: collect Griffel styles during SSR and inject them into the
// streamed HTML so the first paint is already styled (no flash of unstyled content).
// Don't pass a className to FluentProvider: Fluent copies it onto every portal (menus, tooltips).
export function Providers({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  const [renderer] = useState(() => createDOMRenderer());
  const [queryClient] = useState(() => {
    // A 401 anywhere means the session has expired or was revoked: re-check /me, which sends the
    // officer back to the sign-in screen instead of leaving every panel showing its own error.
    // (Not for /me itself: signed out, it always answers 401, and re-checking it would loop.)
    const onError = (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) void client.invalidateQueries({ queryKey: ['me'] });
    };
    const client: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError: (err, query) => query.queryKey[0] !== 'me' && onError(err) }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnWindowFocus: false,
          // Retrying can't fix a refusal (4xx); it only delays showing why.
          retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
        },
      },
    });
    return client;
  });
  const didInsertStyles = useRef(false);

  useServerInsertedHTML(() => {
    if (didInsertStyles.current) return null;
    didInsertStyles.current = true;
    return <>{renderToStyleElements(renderer)}</>;
  });

  return (
    <RendererProvider renderer={renderer}>
      <SSRProvider>
        <FluentProvider theme={theme}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          <Toaster toasterId={TOASTER_ID} position="bottom-end" pauseOnHover />
        </FluentProvider>
      </SSRProvider>
    </RendererProvider>
  );
}
