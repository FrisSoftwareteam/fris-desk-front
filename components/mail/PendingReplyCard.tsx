'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Link,
  makeStyles,
  MessageBar,
  MessageBarBody,
  shorthands,
  Spinner,
  Text,
  Textarea,
  tokens,
} from '@fluentui/react-components';
import { ArrowUndoRegular, CheckmarkRegular, EditRegular, HourglassHalfRegular } from '@fluentui/react-icons';
import type { PendingReplyDto, TicketDetailDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { formatBytes, formatFullDateTime } from '@/lib/format';
import { useNotify } from '@/lib/notify';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { FormatToolbar } from '@/components/compose/Composer';
import { queryKeys } from './MailboxContext';
import { SafeHtmlFrame } from './SafeHtmlFrame';
import { useAttachmentDownload } from './useAttachmentDownload';

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    ...shorthands.borderLeft('3px', 'solid', tokens.colorPaletteMarigoldBorderActive),
    flexShrink: 0,
  },
  head: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  icon: { color: tokens.colorPaletteMarigoldForeground2, fontSize: '20px' },
  time: { marginInlineStart: 'auto', color: tokens.colorNeutralForeground3 },
  meta: { display: 'flex', flexDirection: 'column', gap: '2px', color: tokens.colorNeutralForeground2 },
  files: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalM },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  editorBox: {
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke1),
    paddingInline: tokens.spacingHorizontalS,
  },
  editor: {
    minHeight: '220px',
    maxHeight: '50vh',
    overflowY: 'auto',
    paddingBlock: tokens.spacingVerticalS,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    '& .tiptap': { outlineStyle: 'none', minHeight: '200px' },
    '& .tiptap p': { margin: '0 0 8px' },
    '& .tiptap a': { color: tokens.colorBrandForeground1 },
  },
  toolbar: { paddingInline: 0, flexWrap: 'wrap' },
});

const names = (list: { name: string; email: string }[]) => list.map((r) => r.name || r.email).join(', ');

/**
 * A reply held for a supervisor's approval. Supervisors and admins can send it as written, edit it
 * first, or return it to the officer with a comment; everyone else sees that it's waiting.
 */
export function PendingReplyCard({ reply, ticket }: { reply: PendingReplyDto; ticket: TicketDetailDto }) {
  const styles = useStyles();
  const me = useCurrentUser();
  const client = useQueryClient();
  const notify = useNotify();
  const download = useAttachmentDownload();
  const [busy, setBusy] = useState<'approve' | null>(null);
  const [editing, setEditing] = useState(false);
  const [returning, setReturning] = useState(false);
  const canDecide = me.role === 'supervisor' || me.role === 'admin';
  const mine = reply.author?.id === me.id;
  const sending = reply.status === 'sending';

  const done = (updated: TicketDetailDto, title: string) => {
    client.setQueryData(queryKeys.ticket(updated.id), updated);
    void client.invalidateQueries({ queryKey: ['tickets'] });
    void client.invalidateQueries({ queryKey: queryKeys.counts });
    void client.invalidateQueries({ queryKey: ['history', updated.id] });
    notify(title, undefined, 'success');
  };
  const failed = (e: unknown) => {
    notify('That didn’t work', (e as Error).message);
    // Someone else may have decided it already: show the current state.
    void client.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
  };

  const approve = async () => {
    setBusy('approve');
    try {
      done(await api.approveReply(reply.id), 'Approved and sent');
    } catch (e) {
      failed(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.card} aria-label="Reply awaiting approval">
      <div className={styles.head}>
        <HourglassHalfRegular className={styles.icon} aria-hidden />
        <Text weight="semibold">
          {mine
            ? 'Your reply is waiting for approval'
            : `${reply.author?.displayName ?? 'An officer'}’s reply is waiting for approval`}
        </Text>
        <Badge appearance="tint" color="warning">
          {reply.reason}
        </Badge>
        <Text size={200} className={styles.time}>
          {formatFullDateTime(reply.createdAt)}
        </Text>
      </div>

      <div className={styles.meta}>
        <Text size={200}>
          To: {names(reply.to)}
          {reply.cc.length > 0 && ` · Cc: ${names(reply.cc)}`}
        </Text>
        <Text size={200}>Subject: {reply.subject}</Text>
      </div>

      <SafeHtmlFrame html={reply.bodyHtml} title="Reply awaiting approval" />

      {reply.attachments.length > 0 && (
        <div className={styles.files} aria-label="Attachments">
          {reply.attachments.map((a) => (
            <Link key={a.id} as="button" onClick={() => download(a)}>
              {a.filename} ({formatBytes(a.size)})
            </Link>
          ))}
        </div>
      )}

      {canDecide && !sending ? (
        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={busy === 'approve' ? <Spinner size="tiny" /> : <CheckmarkRegular />}
            disabled={busy !== null}
            onClick={() => void approve()}
          >
            Approve and send
          </Button>
          <Button icon={<EditRegular />} disabled={busy !== null} onClick={() => setEditing(true)}>
            Edit, then send
          </Button>
          <Button icon={<ArrowUndoRegular />} disabled={busy !== null} onClick={() => setReturning(true)}>
            Return with comment
          </Button>
        </div>
      ) : (
        <Text size={200} className={styles.meta}>
          {sending
            ? 'A supervisor is sending it now.'
            : mine
              ? 'A supervisor will approve it or send it back to you with comments. You’ll get a notification either way.'
              : 'A supervisor needs to approve it before it is sent.'}
        </Text>
      )}

      {editing && (
        <EditAndSendDialog
          reply={reply}
          onClose={() => setEditing(false)}
          onSent={(updated) => {
            setEditing(false);
            done(updated, 'Approved and sent with your changes');
          }}
          onError={failed}
        />
      )}
      <ReturnDialog
        open={returning}
        author={reply.author?.displayName ?? 'the officer'}
        onClose={() => setReturning(false)}
        onReturn={async (comment) => {
          try {
            done(await api.returnReply(reply.id, comment), 'Returned to the officer');
            setReturning(false);
          } catch (e) {
            failed(e);
          }
        }}
      />
    </section>
  );
}

function EditAndSendDialog({
  reply,
  onClose,
  onSent,
  onError,
}: {
  reply: PendingReplyDto;
  onClose: () => void;
  onSent: (t: TicketDetailDto) => void;
  onError: (e: unknown) => void;
}) {
  const styles = useStyles();
  const [subject, setSubject] = useState(reply.subject);
  const [sending, setSending] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } })],
    content: reply.bodyHtml,
  });

  const send = async () => {
    if (!editor || editor.isEmpty) return;
    setSending(true);
    try {
      onSent(await api.approveReply(reply.id, { subject, bodyHtml: editor.getHTML() }));
    } catch (e) {
      onError(e);
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && !sending && onClose()}>
      <DialogSurface style={{ maxWidth: 760 }}>
        <DialogBody>
          <DialogTitle>Edit, then send</DialogTitle>
          <DialogContent className="flex flex-col gap-3">
            <Text size={200}>
              It goes out as {reply.author?.displayName ?? 'the officer'}’s reply, marked as approved by you.
            </Text>
            <Field label="Subject">
              <Input value={subject} onChange={(_, d) => setSubject(d.value)} />
            </Field>
            <Field label="Text">
              <div className={styles.editorBox}>
                <FormatToolbar editor={editor} className={styles.toolbar}>
                  {null}
                </FormatToolbar>
                <div className={styles.editor}>
                  <EditorContent editor={editor} />
                </div>
              </div>
            </Field>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              icon={sending ? <Spinner size="tiny" /> : undefined}
              disabled={sending}
              onClick={() => void send()}
            >
              Approve and send
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function ReturnDialog({
  open,
  author,
  onClose,
  onReturn,
}: {
  open: boolean;
  author: string;
  onClose: () => void;
  onReturn: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    await onReturn(comment.trim());
    setSaving(false);
    setComment('');
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && !saving && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Return with comment</DialogTitle>
          <DialogContent className="flex flex-col gap-3">
            <MessageBar intent="info">
              <MessageBarBody>
                The reply goes back to {author}’s drafts and your comment is added to the enquiry as an internal note.
                Nothing is sent to the shareholder.
              </MessageBarBody>
            </MessageBar>
            <Field label="What needs changing?" required>
              <Textarea value={comment} rows={4} resize="vertical" onChange={(_, d) => setComment(d.value)} />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              icon={saving ? <Spinner size="tiny" /> : undefined}
              disabled={saving || !comment.trim()}
              onClick={() => void submit()}
            >
              Return to officer
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
