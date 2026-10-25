'use client';

import { useSyncExternalStore } from 'react';

/**
 * - wide (≥1200px): folders | list | reading pane, like desktop Outlook
 * - medium (768–1199px): folders move into a drawer; list | reading pane
 * - compact (<768px): one pane at a time (list → reading pane), folders in a drawer
 */
export type LayoutMode = 'wide' | 'medium' | 'compact';

const queries = {
  wide: '(min-width: 1200px)',
  medium: '(min-width: 768px)',
};

function read(): LayoutMode {
  if (window.matchMedia(queries.wide).matches) return 'wide';
  if (window.matchMedia(queries.medium).matches) return 'medium';
  return 'compact';
}

function subscribe(onChange: () => void) {
  const lists = Object.values(queries).map((q) => window.matchMedia(q));
  lists.forEach((l) => l.addEventListener('change', onChange));
  return () => lists.forEach((l) => l.removeEventListener('change', onChange));
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, read, () => 'wide');
}
