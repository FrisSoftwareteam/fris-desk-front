'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button, Text, Tooltip, tokens, webDarkTheme, type Theme } from '@fluentui/react-components';
import { MoreHorizontalRegular } from '@fluentui/react-icons';
import { INLINE_ATTACHMENT_ATTR, prepareEmailHtml } from '@/lib/emailHtml';
import { api } from '@/lib/api';
import { useAppTheme } from '@/app/providers';
import { queryKeys } from './MailboxContext';

// Email HTML is untrusted (BUILD_SPEC §10). The server sanitises it; this is the second wall:
// - sandbox without `allow-scripts`: nothing in the email can run JavaScript, even if sanitising missed it
// - `allow-same-origin` only so this component can measure the content height (no scripts → no access back)
// - CSP blocks remote resources, so tracking pixels and remote fonts/CSS don't load; only inline
//   images from our own API (rewritten from cid: links on import) show, fetched here with the session
//   token and handed to the frame as blob: URLs
// - links open in a new tab, never inside the frame
// - clicks on our own inline images are read from outside (allowed by allow-same-origin) to open
//   them in the previewer; the frame itself still runs nothing
const CSP = `default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; form-action 'none'`;

function frameStyles(theme: Theme) {
  const scheme = theme === webDarkTheme ? 'dark' : 'light';
  return `
  html, body { margin: 0; padding: 0; background: transparent; color-scheme: ${scheme}; }
  html { overflow-y: hidden; background: ${theme.colorNeutralBackground1}; }
  body {
    font-family: 'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif;
    font-size: 14px; line-height: 20px; color: ${theme.colorNeutralForeground1}; overflow-wrap: anywhere;
  }
  p { margin: 0 0 12px; }
  a { color: ${theme.colorBrandForegroundLink}; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  blockquote { margin: 0 0 12px; padding-left: 12px; border-left: 3px solid ${theme.colorNeutralStroke1}; color: ${theme.colorNeutralForeground3}; }
  .mention { color: ${theme.colorBrandForeground1}; background: ${theme.colorBrandBackground2}; border-radius: 4px; padding: 0 2px; }
`;
}
/** Makes @mentions of the signed-in officer stand out in notes. */
const myMentionStyles = (theme: Theme, userId: string) =>
  /^[a-f0-9]{24}$/i.test(userId)
    ? `.mention[data-id="${userId}"] { font-weight: 600; background: ${theme.colorPaletteYellowBackground2}; color: ${theme.colorNeutralForeground1}; }`
    : '';
const ZOOM_STYLES = `img[${INLINE_ATTACHMENT_ATTR}] { cursor: zoom-in; } a img { cursor: pointer; }`;

/** blob: URLs for inline pictures, fetched with the session token; revoked when no longer shown. */
function useInlineImageUrls(ids: string[]): Map<string, string> {
  const blobs = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.attachmentBlob(id),
      queryFn: () => api.attachmentBlob(id),
      staleTime: Infinity,
    })),
    combine: (results) => results.map((r) => r.data),
  });
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  const key = blobs.map((b) => (b ? b.size : '-')).join(',') + ids.join(',');
  useEffect(() => {
    const next = new Map<string, string>();
    ids.forEach((id, i) => {
      const blob = blobs[i];
      if (blob) next.set(id, URL.createObjectURL(blob));
    });
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
    // `key` captures ids and which blobs have arrived; the arrays themselves are new every render.
  }, [key]);
  return urls;
}

function fillInlineImages(doc: Document, urls: Map<string, string>) {
  doc.querySelectorAll<HTMLImageElement>(`img[${INLINE_ATTACHMENT_ATTR}]`).forEach((img) => {
    const url = urls.get(img.getAttribute(INLINE_ATTACHMENT_ATTR) ?? '');
    if (url && img.getAttribute('src') !== url) img.setAttribute('src', url);
  });
}

interface SafeHtmlFrameProps {
  html: string;
  title: string;
  /** Called with the attachment id when an inline picture is clicked, unless it's a link. */
  onImageClick?: (attachmentId: string, alt: string) => void;
  /** Highlight @mentions of this officer (internal notes). */
  highlightMentionOf?: string;
}

export function SafeHtmlFrame({ html, title, onImageClick, highlightMentionOf }: SafeHtmlFrameProps) {
  const theme = useAppTheme();
  const ref = useRef<HTMLIFrameElement>(null);
  const onImageClickRef = useRef(onImageClick);
  useEffect(() => {
    onImageClickRef.current = onImageClick;
  });
  const zoomable = onImageClick !== undefined;
  const [height, setHeight] = useState(40);
  const [showQuoted, setShowQuoted] = useState(false);

  const prepared = useMemo(() => prepareEmailHtml(html), [html]);
  const imageUrls = useInlineImageUrls(prepared.inlineAttachmentIds);
  const imageUrlsRef = useRef(imageUrls);
  useEffect(() => {
    imageUrlsRef.current = imageUrls;
    const doc = ref.current?.contentDocument;
    if (doc?.body) fillInlineImages(doc, imageUrls);
  }, [imageUrls]);
  const body = showQuoted && prepared.quotedHtml ? prepared.html + prepared.quotedHtml : prepared.html;
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
      `<base target="_blank"><style>${frameStyles(theme)}${zoomable ? ZOOM_STYLES : ''}` +
      `${highlightMentionOf ? myMentionStyles(theme, highlightMentionOf) : ''}</style></head>` +
      `<body>${body}</body></html>`,
    [body, theme, zoomable, highlightMentionOf],
  );

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    // Start small for each new document: the measured height only grows to fit, so folding the
    // quoted text away would otherwise leave the frame at its old, taller height.
    setHeight(40);
    let observer: ResizeObserver | undefined;
    let listening: Document | undefined;
    const onClick = (e: MouseEvent) => {
      const img = (e.target as Element | null)?.closest?.('img');
      if (!img || img.closest('a[href]') || !onImageClickRef.current) return;
      const id = img.getAttribute(INLINE_ATTACHMENT_ATTR);
      if (!id) return;
      e.preventDefault();
      onImageClickRef.current(id, img.getAttribute('alt') ?? '');
    };
    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      if (listening !== doc) {
        listening?.removeEventListener('click', onClick);
        doc.addEventListener('click', onClick);
        listening = doc;
      }
      fillInlineImages(doc, imageUrlsRef.current);
      // The document's height, not just the body's: margins in email HTML often collapse outside
      // <body>, which would leave the frame slightly short with its own scrollbar.
      // Content a little too wide (e.g. Outlook's width:100% + padding banners) adds a horizontal
      // scrollbar, which would cover the last line unless its height is added too.
      const fit = () => {
        const content = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
        const scrollbar = (frame.contentWindow?.innerHeight ?? 0) - doc.documentElement.clientHeight;
        setHeight(Math.ceil(content + Math.max(scrollbar, 0)) + 4);
      };
      fit();
      observer?.disconnect();
      // Re-fit when content changes size, e.g. inline images finishing loading.
      observer = new ResizeObserver(fit);
      observer.observe(doc.body);
    };
    frame.addEventListener('load', measure);
    measure();
    return () => {
      frame.removeEventListener('load', measure);
      listening?.removeEventListener('click', onClick);
      observer?.disconnect();
    };
  }, [srcDoc]);

  return (
    <>
      {prepared.blockedImages > 0 && (
        <Text as="p" size={200} className="mb-2" style={{ color: tokens.colorNeutralForeground3 }}>
          Pictures from outside sources were blocked to protect your privacy.
        </Text>
      )}
      <iframe
        ref={ref}
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-transparent"
        style={{
          height,
          colorScheme: theme === webDarkTheme ? 'dark' : 'light',
          backgroundColor: theme.colorNeutralBackground1,
        }}
      />
      {prepared.quotedHtml && (
        <Tooltip content={showQuoted ? 'Hide message history' : 'Show message history'} relationship="label">
          <Button
            size="small"
            appearance="secondary"
            icon={<MoreHorizontalRegular />}
            aria-expanded={showQuoted}
            onClick={() => setShowQuoted((v) => !v)}
            className="mt-2"
          />
        </Tooltip>
      )}
    </>
  );
}
