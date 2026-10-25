// Opening an enquiry from outside the mail screen's own list (e.g. the notification bell).
// On the mail screen it is a window event; from other screens, `/?open=<id>`, which the mail
// screen reads once on load.

export const OPEN_TICKET_EVENT = 'registrar-desk:open-ticket';

export function openTicket(ticketId: string, push: (href: string) => void): void {
  if (window.location.pathname === '/') {
    window.dispatchEvent(new CustomEvent<string>(OPEN_TICKET_EVENT, { detail: ticketId }));
  } else {
    push(`/?open=${encodeURIComponent(ticketId)}`);
  }
}

/** The enquiry asked for in the address (`?open=`), removing it so a refresh doesn't reopen it. */
export function takeTicketFromUrl(): string | null {
  const url = new URL(window.location.href);
  const id = url.searchParams.get('open');
  if (!id) return null;
  url.searchParams.delete('open');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return /^[a-f0-9]{24}$/i.test(id) ? id : null;
}
