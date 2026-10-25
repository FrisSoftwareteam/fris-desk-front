'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Button,
  Field,
  Input,
  makeStyles,
  mergeClasses,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Spinner,
  Tag,
  Text,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  ToolbarToggleButton,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import {
  AttachRegular,
  DeleteRegular,
  DocumentTextRegular,
  LinkRegular,
  NoteRegular,
  SendRegular,
  TextBoldRegular,
  TextBulletListLtrRegular,
  TextItalicRegular,
  TextNumberListLtrRegular,
  TextUnderlineRegular,
} from '@fluentui/react-icons';
import {
  renderMergeFields,
  type AttachmentDto,
  type TemplateDto,
  type SendResultDto,
  type ComposeKind,
  type EmailAddress,
  type TicketDetailDto,
} from '@/lib/shared';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { useMailbox, useMailboxStatus } from '@/components/mail/MailboxContext';
import { RecipientField } from './RecipientField';
import { noteMentions } from './mentions';

/** Save at most this often while typing, and this long after the last keystroke. */
const AUTOSAVE_MAX_WAIT_MS = 5_000;
const AUTOSAVE_IDLE_MS = 1_500;

export interface ComposeState {
  kind: ComposeKind;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  bodyHtml: string;
  attachments: AttachmentDto[];
  /** Templates inserted so far (supervisor approval can depend on them). */
  templateIds?: string[];
  /** Set when this was restored from a saved draft (shows "Draft restored"). */
  restoredAt?: string;
}

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
    flexShrink: 0,
  },
  note: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  status: {
    marginInlineStart: 'auto',
    color: tokens.colorNeutralForeground3,
  },
  subject: {
    width: '100%',
    border: 'none',
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    outlineStyle: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase300,
    paddingBlock: '6px',
    color: tokens.colorNeutralForeground1,
  },
  toolbar: {
    paddingInline: 0,
    flexWrap: 'wrap',
  },
  editor: {
    minHeight: '160px',
    maxHeight: '50vh',
    overflowY: 'auto',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    '& .tiptap': { outlineStyle: 'none', minHeight: '150px' },
    '& .tiptap p': { margin: '0 0 8px' },
    '& .tiptap p.is-editor-empty:first-child::before': {
      content: 'attr(data-placeholder)',
      color: tokens.colorNeutralForeground4,
      float: 'left',
      height: 0,
      pointerEvents: 'none',
    },
    '& .tiptap a': { color: tokens.colorBrandForeground1 },
    '& .tiptap .mention': {
      color: tokens.colorBrandForeground1,
      backgroundColor: tokens.colorBrandBackground2,
      borderRadius: tokens.borderRadiusSmall,
      paddingInline: '2px',
    },
  },
  files: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
});

function hasContent(s: ComposeState, editorEmpty: boolean) {
  return !editorEmpty || s.attachments.length > 0 || (s.kind === 'forward' && s.to.length > 0);
}

interface ComposerProps {
  ticket: TicketDetailDto;
  initial: ComposeState;
  onClose: () => void;
  onSent: (result: SendResultDto) => void;
}

export function Composer({ ticket, initial, onClose, onSent }: ComposerProps) {
  const styles = useStyles();
  const user = useCurrentUser();
  const { setHasDraft, officers } = useMailbox();
  const allowlist = useMailboxStatus((m) => m.sendAllowlist) ?? null;
  const officersRef = useRef(officers);
  officersRef.current = officers;
  const queryClient = useQueryClient();
  const isNote = initial.kind === 'note';

  const [state, setState] = useState<ComposeState>(initial);
  const [showCc, setShowCc] = useState(initial.cc.length > 0);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Latest values for the autosave timers and the unmount/unload flush.
  const latest = useRef(state);
  latest.current = state;
  const dirty = useRef(false);
  const finished = useRef(false); // sent or discarded: nothing left to save
  const lastSave = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      Placeholder.configure({
        placeholder: isNote ? 'Write a note for other officers… Type @ to mention a colleague.' : 'Write your reply…',
      }),
      // Mentions only in internal notes: they must never reach a shareholder's email.
      ...(isNote ? [noteMentions(() => officersRef.current, user.id)] : []),
    ],
    content: initial.bodyHtml,
    onUpdate: ({ editor: e }) => update({ bodyHtml: e.getHTML() }),
  });

  const save = useCallback(
    async (opts: { keepalive?: boolean } = {}) => {
      if (finished.current || !dirty.current) return;
      const s = latest.current;
      if (!hasContent(s, editor?.isEmpty ?? true)) return;
      dirty.current = false;
      lastSave.current = Date.now();
      try {
        const saved = await api.saveDraft(
          ticket.id,
          {
            kind: s.kind,
            to: s.to,
            cc: s.cc,
            subject: s.subject,
            bodyHtml: s.bodyHtml,
            attachmentIds: s.attachments.map((a) => a.id),
            templateIds: s.templateIds ?? [],
          },
          opts,
        );
        setSavedAt(new Date());
        setHasDraft(ticket.id, true);
        queryClient.setQueryData(['draft', ticket.id], saved);
      } catch {
        dirty.current = true; // try again on the next change
      }
    },
    [editor, ticket.id, setHasDraft, queryClient],
  );

  const update = (patch: Partial<ComposeState>) => {
    setState((s) => ({ ...s, ...patch }));
    dirty.current = true;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // Save shortly after typing pauses, and at least every few seconds while typing continues.
    const wait = Date.now() - lastSave.current > AUTOSAVE_MAX_WAIT_MS ? 0 : AUTOSAVE_IDLE_MS;
    idleTimer.current = setTimeout(() => void save(), wait);
  };

  // Save when the composer closes (switching enquiry, collapsing) or the tab is closed. Through a
  // ref, so this runs once: re-running it whenever `save` changed identity flushed mid-typing.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    // Only a closing page needs keepalive (the request outlives it); the app itself stays open.
    const onUnload = () => void saveRef.current({ keepalive: true });
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      void saveRef.current();
    };
  }, []);

  const templates = useQuery({
    queryKey: ['templates', ticket.folderId],
    queryFn: () => api.templates(ticket.folderId),
    staleTime: 5 * 60_000,
    enabled: !isNote,
  });

  const insertTemplate = (t: TemplateDto) => {
    if (!editor) return;
    const filled = renderMergeFields(t.bodyHtml, {
      contact: ticket.contact,
      ticket: { reference: ticket.reference, subject: ticket.subject },
      officer: { name: user.displayName, email: user.email },
    });
    if (editor.isEmpty) editor.commands.setContent(filled, { emitUpdate: true });
    else editor.chain().focus().insertContent(filled).run();
    const used = latest.current.templateIds ?? [];
    if (!used.includes(t.id)) update({ templateIds: [...used, t.id] });
    void attachTemplateFiles(t);
  };

  /** Copies the template's form files into this reply (skipping any already attached). */
  const attachTemplateFiles = async (t: TemplateDto) => {
    const has = (f: AttachmentDto) =>
      latest.current.attachments.some((a) => a.filename === f.filename && a.size === f.size);
    if (t.attachments.every(has)) return;
    setUploading(true);
    setError(null);
    try {
      const copies = await api.copyTemplateFiles(ticket.id, t.id);
      update({ attachments: [...latest.current.attachments, ...copies.filter((c) => !has(c))] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await api.uploadAttachments(ticket.id, [...files]);
      update({ attachments: [...latest.current.attachments, ...uploaded] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const s = latest.current;
      const updated = await api.sendMessage(ticket.id, {
        kind: s.kind,
        to: s.to,
        cc: s.cc,
        subject: s.subject,
        bodyHtml: editor?.getHTML() ?? s.bodyHtml,
        attachmentIds: s.attachments.map((a) => a.id),
        templateIds: s.templateIds ?? [],
      });
      finished.current = true;
      setHasDraft(ticket.id, false);
      onSent(updated);
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  };

  const discard = async () => {
    finished.current = true;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    await api.discardDraft(ticket.id, state.kind).catch(() => undefined);
    setHasDraft(ticket.id, false);
    onClose();
  };

  const sendLabel = isNote ? 'Add note' : 'Send';

  return (
    <section
      className={mergeClasses(styles.card, isNote && styles.note)}
      aria-label={isNote ? 'Internal note' : 'Reply'}
    >
      <div className={styles.topRow}>
        <Button
          appearance="primary"
          icon={sending ? <Spinner size="tiny" /> : isNote ? <NoteRegular /> : <SendRegular />}
          disabled={sending || uploading}
          onClick={() => void send()}
        >
          {sending ? (isNote ? 'Adding…' : 'Sending…') : sendLabel}
        </Button>
        <Button appearance="subtle" icon={<DeleteRegular />} disabled={sending} onClick={() => void discard()}>
          Discard
        </Button>
        {isNote && <Text weight="semibold">Internal note. Not sent to the shareholder.</Text>}
        <Text size={200} className={styles.status} aria-live="polite">
          {savedAt
            ? `Draft saved at ${savedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
            : initial.restoredAt
              ? 'Draft restored'
              : ''}
        </Text>
      </div>

      {!isNote && allowlist && (
        <MessageBar intent="warning">
          <MessageBarBody>Test mode: email can only be sent to {allowlist.join(', ')}.</MessageBarBody>
          {state.to.some((r) => !allowlist.includes(r.email.toLowerCase())) && (
            <MessageBarActions>
              <Button
                size="small"
                onClick={() => update({ to: allowlist.map((email) => ({ name: '', email })), cc: [] })}
              >
                Send to test address instead
              </Button>
            </MessageBarActions>
          )}
        </MessageBar>
      )}

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {!isNote && (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <RecipientField
                label="To"
                value={state.to}
                onChange={(to) => update({ to })}
                autoFocus={state.kind === 'forward'}
              />
            </div>
            {!showCc && (
              <Button size="small" appearance="transparent" onClick={() => setShowCc(true)}>
                Cc
              </Button>
            )}
          </div>
          {showCc && <RecipientField label="Cc" value={state.cc} onChange={(cc) => update({ cc })} />}
          <input
            className={styles.subject}
            aria-label="Subject"
            placeholder="Subject"
            value={state.subject}
            onChange={(e) => update({ subject: e.target.value })}
          />
        </>
      )}

      <FormatToolbar editor={editor} className={styles.toolbar}>
        {!isNote && (
          <>
            <ToolbarDivider />
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <ToolbarButton icon={<DocumentTextRegular />}>Canned responses</ToolbarButton>
              </MenuTrigger>
              <MenuPopover>
                {/* Keeps names aligned when only some templates show the form-file icon. */}
                <MenuList hasIcons={templates.data?.some((t) => t.attachments.length > 0)}>
                  {templates.isPending && <MenuItem disabled>Loading…</MenuItem>}
                  {templates.data?.length === 0 && <MenuItem disabled>No templates yet</MenuItem>}
                  {templates.data?.map((t) => (
                    <MenuItem
                      key={t.id}
                      icon={t.attachments.length > 0 ? <AttachRegular /> : undefined}
                      secondaryContent={
                        t.attachments.length > 0
                          ? `${t.attachments.length} form${t.attachments.length === 1 ? '' : 's'}`
                          : undefined
                      }
                      onClick={() => insertTemplate(t)}
                    >
                      {t.name}
                    </MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
          </>
        )}
        <ToolbarButton
          icon={uploading ? <Spinner size="tiny" /> : <AttachRegular />}
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          Attach
        </ToolbarButton>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => void attach(e.target.files)} />
      </FormatToolbar>

      <div className={styles.editor}>
        <EditorContent editor={editor} />
      </div>

      {state.attachments.length > 0 && (
        <div className={styles.files} aria-label="Attachments">
          {state.attachments.map((a) => (
            <Tag
              key={a.id}
              size="small"
              dismissible
              dismissIcon={{ 'aria-label': `Remove ${a.filename}` }}
              secondaryText={formatBytes(a.size)}
              onClick={() => update({ attachments: state.attachments.filter((x) => x.id !== a.id) })}
            >
              {a.filename}
            </Tag>
          ))}
        </div>
      )}
    </section>
  );
}

/** Bold / italic / underline / lists / link, for any TipTap editor (also used by Admin → Templates). */
export function FormatToolbar({
  editor,
  className,
  children,
}: {
  editor: Editor | null;
  className: string;
  children: React.ReactNode;
}) {
  // Re-render on selection changes so the toggle states stay accurate.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = () => force((n) => n + 1);
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  const toggles = [
    { name: 'bold', label: 'Bold', icon: <TextBoldRegular />, run: () => editor?.chain().focus().toggleBold().run() },
    {
      name: 'italic',
      label: 'Italic',
      icon: <TextItalicRegular />,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      name: 'underline',
      label: 'Underline',
      icon: <TextUnderlineRegular />,
      run: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      name: 'bulletList',
      label: 'Bullets',
      icon: <TextBulletListLtrRegular />,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      name: 'orderedList',
      label: 'Numbering',
      icon: <TextNumberListLtrRegular />,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
  ];

  return (
    <Toolbar
      size="small"
      className={className}
      aria-label="Formatting"
      checkedValues={{ format: toggles.filter((t) => editor?.isActive(t.name)).map((t) => t.name) }}
    >
      {toggles.map((t) => (
        <Tooltip key={t.name} content={t.label} relationship="label">
          <ToolbarToggleButton appearance="subtle" icon={t.icon} name="format" value={t.name} onClick={t.run} />
        </Tooltip>
      ))}
      <LinkButton editor={editor} />
      {children}
    </Toolbar>
  );
}

/** Insert or edit a link, like Outlook's link box (no browser prompt). */
function LinkButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');

  const apply = () => {
    if (!editor) return;
    const href = url.trim();
    if (!href) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else {
      const safe = /^(https?:|mailto:)/i.test(href) ? href : `https://${href}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run();
    }
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(_, d) => {
        setOpen(d.open);
        if (d.open) setUrl((editor?.getAttributes('link').href as string | undefined) ?? '');
      }}
      trapFocus
    >
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content="Link" relationship="label">
          <ToolbarButton appearance="subtle" icon={<LinkRegular />} />
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <Field label="Link address">
            <Input value={url} onChange={(_, d) => setUrl(d.value)} placeholder="https://" autoFocus />
          </Field>
          <Button type="submit" appearance="primary">
            {url.trim() ? 'Insert' : 'Remove link'}
          </Button>
        </form>
      </PopoverSurface>
    </Popover>
  );
}
