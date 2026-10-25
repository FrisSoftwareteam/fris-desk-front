// Date/time display in the Outlook style, in the officer's local time zone.

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const weekdayTime = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
const full = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** List-pane time: "14:05" today, "Tue 14:05" this week, "12/10/2026" otherwise. */
export function formatListTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = (startOfDay(now) - startOfDay(d)) / 86_400_000;
  if (days === 0) return time.format(d);
  if (days < 7) return weekdayTime.format(d);
  return shortDate.format(d);
}

export function formatFullDateTime(iso: string): string {
  return full.format(new Date(iso));
}

export type DateGroup = 'Today' | 'Yesterday' | 'Earlier this week' | 'Last week' | 'Older';

/** Outlook-style date group heading for the message list. */
export function dateGroup(iso: string, now = new Date()): DateGroup {
  const days = (startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000;
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  if (days <= dow) return 'Earlier this week';
  if (days <= dow + 7) return 'Last week';
  return 'Older';
}

/** "3h", "2d 4h", "45m" — for SLA countdowns. */
export function formatDuration(ms: number): string {
  const mins = Math.round(Math.abs(ms) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem ? `${days}d ${rem}h` : `${days}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
