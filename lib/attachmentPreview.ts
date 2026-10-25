// Which attachments the in-app previewer can show. Email clients often send files as
// application/octet-stream, so the file extension is the fallback.

export type PreviewKind = 'image' | 'pdf' | 'docx' | 'xlsx';

/** Larger files only offer Download: they'd be slow to fetch through the mailbox and to parse. */
export const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;

// SVG is left out on purpose: it can carry script, and nothing in a shareholder's email needs it.
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/pjpeg', 'image/gif', 'image/webp', 'image/bmp']);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const BY_EXTENSION: Record<string, PreviewKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  jfif: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
};

const BLOB_TYPES: Record<Exclude<PreviewKind, 'image'>, string> = {
  pdf: 'application/pdf',
  docx: DOCX_TYPE,
  xlsx: XLSX_TYPE,
};

const IMAGE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function previewKind(filename: string, contentType: string): PreviewKind | null {
  const type = contentType.toLowerCase().split(';')[0]!.trim();
  if (IMAGE_TYPES.has(type)) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type === DOCX_TYPE) return 'docx';
  if (type === XLSX_TYPE) return 'xlsx';
  return BY_EXTENSION[extension(filename)] ?? null;
}

/** The MIME type to give the fetched bytes (the API sends most files as application/octet-stream). */
export function blobType(kind: PreviewKind, filename: string, contentType: string): string {
  if (kind !== 'image') return BLOB_TYPES[kind];
  const type = contentType.toLowerCase();
  if (IMAGE_TYPES.has(type)) return type;
  return IMAGE_BY_EXTENSION[extension(filename)] ?? 'image/jpeg';
}
