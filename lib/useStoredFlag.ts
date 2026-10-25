'use client';

import { useEffect, useState } from 'react';

/**
 * A boolean remembered in this browser (e.g. which panes are collapsed). Starts at `initial` so the
 * server render matches, then picks up the stored value; storage failures (private mode) are ignored.
 */
export function useStoredFlag(key: string, initial: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === 'true' || stored === 'false') setValue(stored === 'true');
    } catch {
      // Not available: keep the default.
    }
  }, [key]);

  const set = (next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Not available: the choice lasts until reload.
    }
  };

  return [value, set];
}
