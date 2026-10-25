// The app's session token (issued by POST /auth/session or /auth/dev-login). Sent as a Bearer header
// rather than kept in a cookie, because the web app and API are hosted on different sites, where
// browsers won't send the API's cookies. Kept in localStorage so new tabs (and `?open=` links) stay
// signed in until it expires, as the cookie used to; a private window or blocked storage falls back to
// this tab's memory.

const KEY = 'registrar-desk.session';
let memory: string | null = null;

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setToken(token: string): void {
  memory = token;
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // Storage blocked: this tab keeps it in memory.
  }
}

export function clearToken(): void {
  memory = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}

/** Calls `onChange` when another tab signs in or out. Returns the unsubscribe function. */
export function onTokenChangedElsewhere(onChange: () => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
