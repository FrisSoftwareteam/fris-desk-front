// Client-side shaping of (already sanitised) email HTML before it goes into the sandboxed frame.
// Works on an inert DOMParser document: nothing in it runs or loads while we edit it.

/** Matches the class the backend sanitiser puts on Outlook's reply header (QUOTE_CLASS there). */
const QUOTE_MARKERS = '.rd-quote-start, .gmail_quote';

/** "On Tue, 15 Sep 2026 at 11:36, Jane <jane@x.com> wrote:" (Gmail, Apple Mail, most clients). */
const ON_WROTE = /^On\s.{4,250}?\swrote:/i;
/** "-----Original Message-----" (older Outlook, Lotus Notes). */
const ORIGINAL_MESSAGE = /^-{2,}\s*(Original|Forwarded) Message\s*-{2,}/i;
/** Outlook's reply header block: "From: … Sent: … To: … Subject: …". */
const OUTLOOK_HEADER = /^From:\s[\s\S]{0,400}?\b(Sent|Date):\s[\s\S]{0,400}?\b(To|Subject):\s/i;

function startsQuote(el: Element): boolean {
  if (el.matches(QUOTE_MARKERS)) return true;
  if (!/^(DIV|P|SPAN|B|FONT|TABLE|TD)$/.test(el.tagName)) return false;
  const text = (el.textContent ?? '').trim();
  return ON_WROTE.test(text) || ORIGINAL_MESSAGE.test(text) || OUTLOOK_HEADER.test(text);
}

/**
 * An inline picture served by our API: `<origin>/api/attachments/<id>`. Matched on the path, not the
 * origin, because the backend writes its own address (APP_BASE_URL) into the stored HTML on import,
 * and that address changes between development and production.
 */
const INLINE_ATTACHMENT = /^(?:https?:\/\/[^/]+)?\/api\/attachments\/([a-f0-9]{24})(?:[?#].*)?$/i;

/** Marks an inline picture whose bytes the frame's parent fetches with the session token. */
export const INLINE_ATTACHMENT_ATTR = 'data-rd-attachment';

export interface PreparedEmail {
  /** The message without its quoted history (or the whole message if none was found). */
  html: string;
  /** Quoted earlier messages, or null when there are none. */
  quotedHtml: string | null;
  /** External images removed to protect privacy. */
  blockedImages: number;
  /** Attachment ids of inline pictures (marked with INLINE_ATTACHMENT_ATTR, no src yet). */
  inlineAttachmentIds: string[];
}

/**
 * - Removes images hosted outside our API (signatures, logos, tracking pixels), as Outlook does.
 * - Inline pictures from our API lose their src (the frame can't send the session token) and are
 *   marked with their attachment id, for the parent to fill in with a blob: URL.
 * - Splits off quoted reply history so the reading pane can fold it behind a "…" button.
 */
export function prepareEmailHtml(html: string): PreparedEmail {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  let blockedImages = 0;
  const inline = new Set<string>();
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('data:')) return;
    const id = INLINE_ATTACHMENT.exec(src)?.[1];
    if (id) {
      img.removeAttribute('src');
      img.setAttribute(INLINE_ATTACHMENT_ATTR, id);
      inline.add(id);
      return;
    }
    img.remove();
    blockedImages += 1;
  });
  const inlineAttachmentIds = [...inline];

  // First element (in document order) where quoted history begins.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let start: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (startsQuote(node as Element)) {
      start = node as Element;
      break;
    }
  }
  // A separator line just before Outlook's header belongs to the quote too.
  const previous = start?.previousElementSibling;
  if (start && previous?.tagName === 'HR') start = previous;

  if (start && doc.body.lastChild) {
    const range = doc.createRange();
    range.setStartBefore(start);
    range.setEndAfter(doc.body.lastChild);
    const quoted = range.extractContents();
    // Only fold when there's something of the new message left to show.
    if ((doc.body.textContent ?? '').trim().length > 0) {
      const holder = doc.createElement('div');
      holder.appendChild(quoted);
      return { html: doc.body.innerHTML, quotedHtml: holder.innerHTML, blockedImages, inlineAttachmentIds };
    }
    doc.body.appendChild(quoted);
  }

  return { html: doc.body.innerHTML, quotedHtml: null, blockedImages, inlineAttachmentIds };
}
