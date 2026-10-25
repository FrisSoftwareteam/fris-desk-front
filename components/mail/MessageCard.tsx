'use client';

import { useState } from 'react';
import {
  Avatar,
  Button,
  makeStyles,
  mergeClasses,
  shorthands,
  Text,
  Tooltip,
  tokens,
  useRestoreFocusTarget,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  AttachRegular,
  DocumentPdfRegular,
  DocumentRegular,
  DocumentTableRegular,
  DocumentTextRegular,
  ImageRegular,
  NoteRegular,
} from '@fluentui/react-icons';
import type { AttachmentDto, MessageDto } from '@/lib/shared';
import { previewKind, type PreviewKind } from '@/lib/attachmentPreview';
import { formatBytes, formatFullDateTime, formatListTime } from '@/lib/format';
import { AttachmentPreview, type PreviewItem } from './AttachmentPreview';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { SafeHtmlFrame } from './SafeHtmlFrame';
import { useAttachmentDownload } from './useAttachmentDownload';

const useStyles = makeStyles({
  card: {
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    overflow: 'hidden',
    flexShrink: 0,
  },
  outbound: {
    ...shorthands.borderLeft(tokens.strokeWidthThickest, 'solid', tokens.colorBrandStroke1),
  },
  note: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorPaletteYellowBorder1),
  },
  head: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    width: '100%',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    border: 'none',
    background: 'transparent',
    textAlign: 'start',
    cursor: 'pointer',
    color: 'inherit',
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
    },
  },
  who: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sub: { color: tokens.colorNeutralForeground3 },
  noteIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorPaletteYellowBackground2,
    color: tokens.colorPaletteYellowForeground2,
  },
  body: {
    padding: `0 ${tokens.spacingHorizontalL} ${tokens.spacingVerticalL}`,
    paddingInlineStart: `calc(${tokens.spacingHorizontalL} + 40px + ${tokens.spacingHorizontalM})`,
  },
  attachments: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
  },
  attachment: {
    display: 'flex',
    alignItems: 'center',
    maxWidth: '280px',
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke1),
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  // Opens the previewer (or downloads, for files that can't be previewed).
  chipMain: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: 1,
    minWidth: 0,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    ...shorthands.borderStyle('none'),
    background: 'transparent',
    color: tokens.colorNeutralForeground1,
    textAlign: 'start',
    textDecorationLine: 'none',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
    },
  },
  chipDownload: { flexShrink: 0, marginInlineEnd: '2px' },
  fileIcon: { flexShrink: 0, fontSize: '24px' },
});

interface MessageCardProps {
  message: MessageDto;
  open: boolean;
  onToggle: () => void;
}

/** One email (or internal note) in the thread. Collapsed shows a one-line preview, like Outlook. */
export function MessageCard({ message: m, open, onToggle }: MessageCardProps) {
  const styles = useStyles();
  // What the previewer shows: the message's attachments, or one inline image clicked in the body.
  const [preview, setPreview] = useState<{ items: PreviewItem[]; index: number } | null>(null);
  const isNote = m.direction === 'note';
  const me = useCurrentUser();
  const recipients = m.to.map((r) => r.name || r.email).join(', ');

  let subline: string;
  if (!open) subline = m.bodyText;
  else if (isNote) subline = 'Internal note. Not sent to the shareholder.';
  else if (m.direction === 'outbound' && m.author)
    subline =
      `To: ${recipients}. Sent by ${m.author.displayName}` +
      (m.approvedBy ? `, approved by ${m.approvedBy.displayName}` : '');
  else if (m.direction === 'inbound' && m.author) subline = `Logged by ${m.author.displayName}`;
  else if (m.direction === 'outbound' && !m.author) subline = `To: ${recipients}. Sent automatically`;
  else subline = `To: ${recipients}`;

  return (
    <article
      className={mergeClasses(styles.card, m.direction === 'outbound' && styles.outbound, isNote && styles.note)}
    >
      <button type="button" className={styles.head} aria-expanded={open} onClick={onToggle}>
        {isNote ? (
          <span className={styles.noteIcon} aria-hidden>
            <NoteRegular fontSize={20} />
          </span>
        ) : (
          <Avatar name={m.from.name || m.from.email} size={40} color="colorful" aria-hidden />
        )}
        <span className={styles.who}>
          <Text weight="semibold" className={styles.truncate}>
            {isNote ? (m.author?.displayName ?? (m.from.name || 'Registrar Desk')) : m.from.name}
            {!isNote && m.from.email && open && (
              <Text size={200} className={styles.sub}>
                {' '}
                &lt;{m.from.email}&gt;
              </Text>
            )}
          </Text>
          <Text size={200} className={mergeClasses(styles.truncate, styles.sub)}>
            {subline}
          </Text>
        </span>
        <span className="flex items-center gap-1">
          {!open && m.attachments.length > 0 && <AttachRegular className={styles.sub} aria-label="Has attachments" />}
          <Text size={200} className={styles.sub} title={formatFullDateTime(m.sentAt)}>
            {open ? formatFullDateTime(m.sentAt) : formatListTime(m.sentAt)}
          </Text>
        </span>
      </button>

      {open && (
        <div className={styles.body}>
          <SafeHtmlFrame
            html={m.bodyHtml}
            title={`Message from ${m.from.name || m.from.email}`}
            highlightMentionOf={isNote ? me.id : undefined}
            onImageClick={(id, alt) => {
              const item = {
                id,
                filename: alt.trim() || 'Picture',
                contentType: '',
                size: null,
                kind: 'image' as const,
              };
              setPreview({ items: [item], index: 0 });
            }}
          />
          {m.attachments.length > 0 && (
            <div className={styles.attachments}>
              {m.attachments.map((a, i) => (
                <AttachmentChip
                  key={a.id}
                  attachment={a}
                  onPreview={() => setPreview({ items: m.attachments, index: i })}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <AttachmentPreview
        items={preview?.items ?? []}
        index={preview?.index ?? null}
        onIndexChange={(index) => setPreview(index === null ? null : (p) => p && { ...p, index })}
      />
    </article>
  );
}

/** One attachment: click to preview (or download, if it can't be previewed); the icon downloads. */
function AttachmentChip({ attachment: a, onPreview }: { attachment: AttachmentDto; onPreview: () => void }) {
  const styles = useStyles();
  const kind = previewKind(a.filename, a.contentType);
  // The previewer isn't opened by a DialogTrigger, so this tells Fluent where to return focus.
  const restoreFocus = useRestoreFocusTarget();
  const download = useAttachmentDownload();
  const content = (
    <>
      <AttachmentIcon kind={kind} className={styles.fileIcon} />
      <span className="flex min-w-0 flex-col">
        <Text size={200} weight="semibold" className={styles.truncate}>
          {a.filename}
        </Text>
        <Text size={100} className={styles.sub}>
          {formatBytes(a.size)}
        </Text>
      </span>
    </>
  );

  return (
    <div className={styles.attachment}>
      {kind ? (
        <button
          type="button"
          className={styles.chipMain}
          onClick={onPreview}
          title={`Preview ${a.filename}`}
          {...restoreFocus}
        >
          {content}
        </button>
      ) : (
        <button
          type="button"
          className={styles.chipMain}
          onClick={() => download(a)}
          title={`Download ${a.filename}`}
        >
          {content}
        </button>
      )}
      {kind && (
        <Tooltip content={`Download ${a.filename}`} relationship="label">
          <Button
            appearance="subtle"
            size="small"
            className={styles.chipDownload}
            icon={<ArrowDownloadRegular />}
            onClick={() => download(a)}
          />
        </Tooltip>
      )}
    </div>
  );
}

function AttachmentIcon({ kind, className }: { kind: PreviewKind | null; className: string }) {
  if (kind === 'pdf') {
    return <DocumentPdfRegular className={className} style={{ color: tokens.colorPaletteRedForeground1 }} />;
  }
  if (kind === 'image') {
    return <ImageRegular className={className} style={{ color: tokens.colorPaletteBlueForeground2 }} />;
  }
  if (kind === 'docx') {
    return <DocumentTextRegular className={className} style={{ color: tokens.colorBrandForeground1 }} />;
  }
  if (kind === 'xlsx') {
    return <DocumentTableRegular className={className} style={{ color: tokens.colorPaletteGreenForeground1 }} />;
  }
  return <DocumentRegular className={className} style={{ color: tokens.colorNeutralForeground3 }} />;
}
