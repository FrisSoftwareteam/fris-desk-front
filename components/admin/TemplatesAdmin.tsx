'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Badge,
  Button,
  Dropdown,
  Field,
  Input,
  InteractionTag,
  InteractionTagPrimary,
  InteractionTagSecondary,
  makeStyles,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  shorthands,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TagGroup,
  Text,
  ToolbarButton,
  tokens,
} from '@fluentui/react-components';
import { AttachRegular, BracesRegular, DeleteRegular, EditRegular } from '@fluentui/react-icons';
import { MERGE_FIELDS, type AttachmentDto, type TemplateDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { FormatToolbar } from '@/components/compose/Composer';
import { AttachmentPreview } from '@/components/mail/AttachmentPreview';
import {
  ConfirmDelete,
  EditDialog,
  ListState,
  SectionHeader,
  useAdminStyles,
  useAdminWrite,
  useLookups,
} from './common';

type TemplateForm = Omit<TemplateDto, 'id'>;

const useStyles = makeStyles({
  editorBox: {
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke1),
    paddingInline: tokens.spacingHorizontalS,
  },
  editor: {
    minHeight: '220px',
    maxHeight: '45vh',
    overflowY: 'auto',
    paddingBlock: tokens.spacingVerticalS,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    '& .tiptap': { outlineStyle: 'none', minHeight: '200px' },
    '& .tiptap p': { margin: '0 0 8px' },
    '& .tiptap a': { color: tokens.colorBrandForeground1 },
  },
  toolbar: { paddingInline: 0, flexWrap: 'wrap' },
  snippet: {
    display: '-webkit-box',
    WebkitLineClamp: '1',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
});

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function TemplatesAdmin() {
  const styles = useAdminStyles();
  const { folders, folderName } = useLookups();
  const templates = useQuery({ queryKey: ['templates', 'all'], queryFn: () => api.templates(null) });
  const write = useAdminWrite(['templates']);
  const [editing, setEditing] = useState<{ id: string | null; form: TemplateForm } | null>(null);
  const [deleting, setDeleting] = useState<TemplateDto | null>(null);
  const list = templates.data ?? [];
  const local = useStyles();

  const save = async () => {
    if (!editing) return;
    const { attachments, ...rest } = editing.form;
    const body = { ...rest, name: editing.form.name.trim(), attachmentIds: attachments.map((a) => a.id) };
    if (!body.name) throw new Error('Enter a name');
    if (!textOf(body.bodyHtml)) throw new Error('Write the template text');
    await write.mutateAsync(() =>
      editing.id ? api.admin.templates.update(editing.id, body) : api.admin.templates.create(body),
    );
  };

  return (
    <>
      <SectionHeader
        title="Templates"
        description="Canned responses officers insert from “Canned responses” when replying. Merge fields such as {{contact.name}} are filled in for each enquiry, and any form files are attached to the reply."
        addLabel="New template"
        onAdd={() =>
          setEditing({ id: null, form: { name: '', subject: '', bodyHtml: '', folderId: null, attachments: [] } })
        }
      />
      <ListState query={templates} empty={list.length === 0}>
        <Table size="small" aria-label="Templates" style={{ minWidth: 760 }}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell style={{ width: 260 }}>Name</TableHeaderCell>
              <TableHeaderCell>Text</TableHeaderCell>
              <TableHeaderCell style={{ width: 170 }}>Offered in</TableHeaderCell>
              <TableHeaderCell style={{ width: 96 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <span className="flex flex-col py-1">
                    <Text weight="semibold">{t.name}</Text>
                    {t.attachments.length > 0 && (
                      <Text size={200} className={styles.muted}>
                        <AttachRegular aria-hidden /> {t.attachments.map((a) => a.filename).join(', ')}
                      </Text>
                    )}
                    {t.subject && (
                      <Text size={200} className={styles.muted}>
                        Subject: {t.subject}
                      </Text>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <Text size={200} className={local.snippet}>
                    {textOf(t.bodyHtml)}
                  </Text>
                </TableCell>
                <TableCell>
                  {t.folderId ? (
                    <Badge appearance="tint" color="informative">
                      {folderName(t.folderId)}
                    </Badge>
                  ) : (
                    'All folders'
                  )}
                </TableCell>
                <TableCell>
                  <div className={styles.rowActions}>
                    <Button
                      appearance="subtle"
                      icon={<EditRegular />}
                      aria-label={`Edit ${t.name}`}
                      onClick={() => {
                        const { id, ...form } = t;
                        setEditing({ id, form });
                      }}
                    />
                    <Button
                      appearance="subtle"
                      icon={<DeleteRegular />}
                      aria-label={`Delete ${t.name}`}
                      onClick={() => setDeleting(t)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListState>

      <EditDialog
        wide
        open={editing !== null}
        title={editing?.id ? 'Edit template' : 'New template'}
        onClose={() => setEditing(null)}
        onSave={save}
      >
        {editing && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                <Input
                  value={editing.form.name}
                  autoFocus
                  onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, name: d.value } })}
                />
              </Field>
              <Field label="Offered in" hint="Limit it to enquiries in one folder, or offer it everywhere.">
                <Dropdown
                  value={folderName(editing.form.folderId) ?? 'All folders'}
                  selectedOptions={[editing.form.folderId ?? '']}
                  onOptionSelect={(_, d) =>
                    setEditing({ ...editing, form: { ...editing.form, folderId: d.optionValue || null } })
                  }
                >
                  <Option value="">All folders</Option>
                  {folders.map((f) => (
                    <Option key={f.id} value={f.id}>
                      {f.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>
            <Field label="Subject" hint="Optional. Used when the template starts a new email.">
              <Input
                value={editing.form.subject}
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, subject: d.value } })}
              />
            </Field>
            <Field label="Text" required>
              <TemplateEditor
                key={editing.id ?? 'new'}
                initial={editing.form.bodyHtml}
                onChange={(bodyHtml) => setEditing((e) => e && { ...e, form: { ...e.form, bodyHtml } })}
              />
            </Field>
            <FormFiles
              files={editing.form.attachments}
              onChange={(attachments) => setEditing((e) => e && { ...e, form: { ...e.form, attachments } })}
            />
          </>
        )}
      </EditDialog>

      <ConfirmDelete
        what={deleting && `the template “${deleting.name}”`}
        consequence="If auto-acknowledgement uses it, choose another template in Settings."
        onClose={() => setDeleting(null)}
        onConfirm={() => write.mutateAsync(() => api.admin.templates.remove(deleting!.id)).then(() => undefined)}
      />
    </>
  );
}

function TemplateEditor({ initial, onChange }: { initial: string; onChange: (html: string) => void }) {
  const styles = useStyles();
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } })],
    content: initial,
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  return (
    <div className={styles.editorBox}>
      <FormatToolbar editor={editor} className={styles.toolbar}>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <ToolbarButton appearance="subtle" icon={<BracesRegular />}>
              Merge field
            </ToolbarButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {MERGE_FIELDS.map((m) => (
                <MenuItem
                  key={m.field}
                  secondaryContent={m.field}
                  onClick={() => editor?.chain().focus().insertContent(m.field).run()}
                >
                  {m.description}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      </FormatToolbar>
      <div className={styles.editor}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/** The form files a template attaches to each reply: upload, preview, remove. */
function FormFiles({ files, onChange }: { files: AttachmentDto[]; onChange: (files: AttachmentDto[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const latest = useRef(files);
  latest.current = files;

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    setError(null);
    try {
      const added = await api.admin.uploadTemplateFiles([...list]);
      onChange([...latest.current, ...added].slice(0, 10));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Field
      label="Form files"
      hint="Optional. Attached to the reply whenever an officer uses this template (up to 10 files, 25 MB each)."
      validationMessage={error ?? undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        {files.length > 0 && (
          <TagGroup
            aria-label="Form files"
            onDismiss={(_, d) => onChange(files.filter((f) => f.id !== d.value))}
            className="flex flex-wrap gap-2"
          >
            {files.map((f, i) => (
              <InteractionTag key={f.id} value={f.id} size="small">
                {/* type="button": these sit inside the dialog's form, which would otherwise save. */}
                <InteractionTagPrimary
                  type="button"
                  hasSecondaryAction
                  secondaryText={formatBytes(f.size)}
                  onClick={() => setPreview(i)}
                >
                  {f.filename}
                </InteractionTagPrimary>
                <InteractionTagSecondary type="button" aria-label={`Remove ${f.filename}`} />
              </InteractionTag>
            ))}
          </TagGroup>
        )}
        <Button
          size="small"
          icon={uploading ? <Spinner size="tiny" /> : <AttachRegular />}
          disabled={uploading || files.length >= 10}
          onClick={() => input.current?.click()}
        >
          Add form file
        </Button>
        <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
      </div>
      <AttachmentPreview items={files} index={preview} onIndexChange={setPreview} />
    </Field>
  );
}
