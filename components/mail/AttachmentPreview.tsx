'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogSurface,
  DialogTitle,
  makeStyles,
  mergeClasses,
  MessageBar,
  MessageBarBody,
  shorthands,
  Spinner,
  Tab,
  TabList,
  Text,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DismissRegular,
  DocumentDismissRegular,
  ZoomFitRegular,
  ZoomInRegular,
  ZoomOutRegular,
} from '@fluentui/react-icons';
import { api, ApiError } from '@/lib/api';
import { blobType, MAX_PREVIEW_BYTES, previewKind, type PreviewKind } from '@/lib/attachmentPreview';
import { formatBytes } from '@/lib/format';
import { useLayoutMode } from '@/lib/useLayoutMode';
import { queryKeys } from './MailboxContext';
import { SafeHtmlFrame } from './SafeHtmlFrame';
import { useAttachmentDownload } from './useAttachmentDownload';

export interface PreviewItem {
  id: string;
  filename: string;
  contentType: string;
  /** Unknown for inline images (they aren't listed with the message's attachments). */
  size: number | null;
  /** Overrides detection from the name and type (inline images). */
  kind?: PreviewKind;
}

/** A spreadsheet is shown up to this size; Download has the rest. */
const MAX_ROWS = 1000;
const MAX_COLUMNS = 50;

type Cell = string | number | boolean | Date | null;
type Loaded =
  | { kind: 'image'; blob: Blob }
  | { kind: 'pdf'; blob: Blob }
  | { kind: 'docx'; html: string }
  | { kind: 'xlsx'; sheets: { name: string; rows: Cell[][] }[] };

async function loadPreview(item: PreviewItem, kind: PreviewKind): Promise<Loaded> {
  const blob = await api.attachmentBlob(item.id);
  if (kind === 'image' || kind === 'pdf') {
    // The API sends most files as application/octet-stream; the viewer needs the real type.
    const type = blobType(kind, item.filename, blob.type.startsWith('image/') ? blob.type : item.contentType);
    return { kind, blob: new Blob([blob], { type }) } as Loaded;
  }
  if (kind === 'docx') {
    // Loaded on demand so the converters don't weigh down the mail page.
    const mammoth = await import('mammoth');
    // No external file access: a document can't make the converter fetch anything.
    const result = await mammoth.convertToHtml(
      { arrayBuffer: await blob.arrayBuffer() },
      { externalFileAccess: false },
    );
    return { kind, html: result.value };
  }
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(blob);
  return { kind, sheets: sheets.map((s) => ({ name: s.sheet, rows: s.data as Cell[][] })) };
}

const useStyles = makeStyles({
  surface: {
    display: 'flex',
    flexDirection: 'column',
    width: 'min(1200px, calc(100vw - 48px))',
    maxWidth: 'none',
    height: 'calc(100dvh - 48px)',
    padding: 0,
    overflow: 'hidden',
  },
  fullScreen: {
    width: '100vw',
    height: '100dvh',
    borderRadius: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS} ${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    ...shorthands.borderBottom(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  },
  title: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sub: { color: tokens.colorNeutralForeground3 },
  stage: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  centered: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    textAlign: 'center',
  },
  bigIcon: { fontSize: '48px', color: tokens.colorNeutralForeground3 },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderBottom(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
  },
  imageFit: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingHorizontalL,
    boxSizing: 'border-box',
    height: '100%',
  },
  fitImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  zoomed: {
    padding: tokens.spacingHorizontalL,
    width: 'fit-content',
    marginInline: 'auto',
  },
  pdf: {
    flex: 1,
    width: '100%',
    ...shorthands.borderStyle('none'),
  },
  page: {
    maxWidth: '816px',
    margin: `${tokens.spacingVerticalL} auto`,
    padding: 'clamp(16px, 5vw, 48px)',
    backgroundColor: '#ffffff',
    boxShadow: tokens.shadow4,
  },
  note: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`,
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sheet: {
    borderCollapse: 'collapse',
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: tokens.fontSizeBase200,
    '& th, & td': {
      ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
      padding: `2px ${tokens.spacingHorizontalS}`,
      maxWidth: '320px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    '& th': {
      position: 'sticky',
      top: 0,
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorNeutralForeground3,
      fontWeight: tokens.fontWeightRegular,
    },
    '& td:first-child': {
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorNeutralForeground3,
      textAlign: 'end',
    },
  },
  number: { textAlign: 'end' },
});

interface AttachmentPreviewProps {
  items: PreviewItem[];
  /** The item shown; null closes the previewer. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
}

/** Full-window viewer for a message's attachments, like Outlook's: images, PDF, Word and Excel. */
export function AttachmentPreview({ items, index, onIndexChange }: AttachmentPreviewProps) {
  const styles = useStyles();
  const compact = useLayoutMode() === 'compact';
  const download = useAttachmentDownload();
  const item = index === null ? undefined : items[index];
  const count = items.length;
  const isOpen = item !== undefined;

  const go = (step: number) => {
    if (index === null || count < 2) return;
    onIndexChange((index + step + count) % count);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Arrow keys also move between sheet tabs; leave those alone.
    if ((e.target as HTMLElement).closest('[role="tablist"]')) return;
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(_, d) => !d.open && onIndexChange(null)}>
      <DialogSurface
        aria-describedby={undefined}
        className={mergeClasses(styles.surface, compact && styles.fullScreen)}
        onKeyDown={onKeyDown}
      >
        {item && (
          <>
            <div className={styles.header}>
              <div className={styles.title}>
                <DialogTitle as="h2" className={styles.truncate} style={{ fontSize: tokens.fontSizeBase400 }}>
                  {item.filename}
                </DialogTitle>
                <Text size={200} className={styles.sub}>
                  {[item.size !== null ? formatBytes(item.size) : null, count > 1 ? `${index! + 1} of ${count}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </div>
              {count > 1 && (
                <>
                  <Tooltip content="Previous (←)" relationship="label">
                    <Button appearance="subtle" icon={<ChevronLeftRegular />} onClick={() => go(-1)} />
                  </Tooltip>
                  <Tooltip content="Next (→)" relationship="label">
                    <Button appearance="subtle" icon={<ChevronRightRegular />} onClick={() => go(1)} />
                  </Tooltip>
                </>
              )}
              <Button
                aria-label={compact ? 'Download' : undefined}
                appearance="subtle"
                icon={<ArrowDownloadRegular />}
                onClick={() => download(item)}
              >
                {compact ? undefined : 'Download'}
              </Button>
              <Tooltip content="Close" relationship="label">
                <Button appearance="subtle" icon={<DismissRegular />} onClick={() => onIndexChange(null)} />
              </Tooltip>
            </div>
            <div className={styles.stage}>
              <PreviewBody key={item.id} item={item} />
            </div>
          </>
        )}
      </DialogSurface>
    </Dialog>
  );
}

function PreviewBody({ item }: { item: PreviewItem }) {
  const styles = useStyles();
  const kind = item.kind ?? previewKind(item.filename, item.contentType);
  const tooLarge = item.size !== null && item.size > MAX_PREVIEW_BYTES;

  const preview = useQuery({
    queryKey: queryKeys.attachmentPreview(item.id),
    queryFn: () => loadPreview(item, kind!),
    enabled: kind !== null && !tooLarge,
    // Attachments never change; keep the bytes only briefly once the viewer has moved on.
    staleTime: Infinity,
    gcTime: 2 * 60_000,
    // A file that can't be read won't read on a second try; only network/server hiccups are retried.
    retry: (count, err) => err instanceof ApiError && (err.status === 0 || err.status >= 500) && count < 1,
  });

  if (kind === null || tooLarge) {
    return (
      <NoPreview
        item={item}
        message={tooLarge ? 'This file is too large to preview.' : "This type of file can't be previewed."}
      />
    );
  }
  if (preview.isPending) {
    return (
      <div className={styles.centered}>
        <Spinner label="Opening…" />
      </div>
    );
  }
  if (preview.isError) {
    const err = preview.error;
    const message =
      err instanceof ApiError ? err.message : "This file couldn't be read. It may be damaged or in an older format.";
    return <NoPreview item={item} message={message} error />;
  }

  const data = preview.data;
  if (data.kind === 'image') return <ImageView blob={data.blob} alt={item.filename} />;
  if (data.kind === 'pdf') return <PdfView blob={data.blob} title={item.filename} />;
  if (data.kind === 'docx') {
    return (
      <>
        <Text size={200} className={styles.note}>
          Simplified preview. Download the file to see its exact layout.
        </Text>
        <div className={styles.scroll}>
          <div className={styles.page}>
            <SafeHtmlFrame html={data.html} title={item.filename} />
          </div>
        </div>
      </>
    );
  }
  return <SheetView sheets={data.sheets} />;
}

function NoPreview({ item, message, error }: { item: PreviewItem; message: string; error?: boolean }) {
  const styles = useStyles();
  const download = useAttachmentDownload();
  return (
    <div className={styles.centered}>
      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>{message}</MessageBarBody>
        </MessageBar>
      ) : (
        <>
          <DocumentDismissRegular className={styles.bigIcon} />
          <Text>{message}</Text>
        </>
      )}
      <Button appearance="primary" icon={<ArrowDownloadRegular />} onClick={() => download(item)}>
        Download
      </Button>
    </div>
  );
}

/** An object URL for the blob, released when the blob changes or the viewer closes. */
function useObjectUrl(blob: Blob): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(undefined);
    };
  }, [blob]);
  return url;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

function ImageView({ blob, alt }: { blob: Blob; alt: string }) {
  const styles = useStyles();
  const url = useObjectUrl(blob);
  // null = fit to the window; otherwise a multiple of the picture's own size.
  const [zoom, setZoom] = useState<number | null>(null);
  const [naturalWidth, setNaturalWidth] = useState(0);

  const step = (dir: 1 | -1) => {
    const current = zoom ?? 1;
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > current) : [...ZOOM_STEPS].reverse().find((z) => z < current);
    if (next !== undefined) setZoom(next);
  };

  return (
    <>
      <div className={styles.toolbar}>
        <Tooltip content="Zoom out" relationship="label">
          <Button appearance="subtle" size="small" icon={<ZoomOutRegular />} onClick={() => step(-1)} />
        </Tooltip>
        <Tooltip content="Zoom in" relationship="label">
          <Button appearance="subtle" size="small" icon={<ZoomInRegular />} onClick={() => step(1)} />
        </Tooltip>
        <Button
          appearance="subtle"
          size="small"
          icon={<ZoomFitRegular />}
          onClick={() => setZoom(zoom === null ? 1 : null)}
        >
          {zoom === null ? 'Actual size' : 'Fit to window'}
        </Button>
        {zoom !== null && (
          <Text size={200} className={styles.sub}>
            {Math.round(zoom * 100)}%
          </Text>
        )}
      </div>
      <div className={styles.scroll}>
        {url &&
          (zoom === null ? (
            <div className={styles.imageFit}>
              <img
                src={url}
                alt={alt}
                className={styles.fitImage}
                onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth)}
              />
            </div>
          ) : (
            <div className={styles.zoomed}>
              <img
                src={url}
                alt={alt}
                style={{ width: naturalWidth ? naturalWidth * zoom : undefined, maxWidth: 'none' }}
              />
            </div>
          ))}
      </div>
    </>
  );
}

function PdfView({ blob, title }: { blob: Blob; title: string }) {
  const styles = useStyles();
  const url = useObjectUrl(blob);
  // Not sandboxed: a sandbox stops the browser's PDF viewer from loading. The blob holds only the
  // PDF's bytes (typed application/pdf), so no page or script of the sender's runs here.
  return url ? <iframe src={url} title={title} className={styles.pdf} /> : null;
}

function columnName(i: number): string {
  let name = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function cellText(value: Cell): string {
  if (value === null) return '';
  if (value instanceof Date) return value.toLocaleDateString('en-GB');
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function SheetView({ sheets }: { sheets: { name: string; rows: Cell[][] }[] }) {
  const styles = useStyles();
  const [selected, setSelected] = useState(0);
  const sheet = sheets[selected];
  const rows = sheet?.rows.slice(0, MAX_ROWS) ?? [];
  const width = Math.min(MAX_COLUMNS, Math.max(0, ...rows.map((r) => r.length)));
  const truncated = (sheet?.rows.length ?? 0) > MAX_ROWS || rows.some((r) => r.length > MAX_COLUMNS);

  return (
    <>
      {sheets.length > 1 && (
        <TabList
          size="small"
          selectedValue={selected}
          onTabSelect={(_, d) => setSelected(d.value as number)}
          className={styles.toolbar}
        >
          {sheets.map((s, i) => (
            <Tab key={i} value={i}>
              {s.name}
            </Tab>
          ))}
        </TabList>
      )}
      {truncated && (
        <Text size={200} className={styles.note}>
          Showing the first {MAX_ROWS.toLocaleString()} rows and {MAX_COLUMNS} columns. Download the file to see it all.
        </Text>
      )}
      {rows.length === 0 ? (
        <div className={styles.centered}>
          <Text className={styles.sub}>This sheet is empty.</Text>
        </div>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.sheet}>
            <thead>
              <tr>
                <th />
                {Array.from({ length: width }, (_, c) => (
                  <th key={c} scope="col">
                    {columnName(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  <td>{r + 1}</td>
                  {Array.from({ length: width }, (_, c) => {
                    const text = cellText(row[c] ?? null);
                    return (
                      <td key={c} title={text} className={typeof row[c] === 'number' ? styles.number : undefined}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
