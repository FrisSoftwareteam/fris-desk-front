'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Dropdown,
  Field,
  Input,
  Option,
  Radio,
  RadioGroup,
  SpinButton,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@fluentui/react-components';
import { DeleteRegular, EditRegular, FolderRegular } from '@fluentui/react-icons';
import { CATEGORY_COLORS, CATEGORY_TYPES, type CategoryDto, type CategoryType, type FolderDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { CategoryPill, CategorySwatch } from '@/components/mail/CategoryPill';
import { ConfirmDelete, EditDialog, ListState, SectionHeader, useAdminStyles, useAdminWrite } from './common';

// ── Folders ──────────────────────────────────────────────────────────────────

type FolderForm = { name: string; order: number; parentId: string | null };

export function FoldersAdmin() {
  const styles = useAdminStyles();
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders });
  const write = useAdminWrite(['folders'], ['ticket-counts'], ['tickets']);
  const [editing, setEditing] = useState<{ id: string | null; form: FolderForm } | null>(null);
  const [deleting, setDeleting] = useState<FolderDto | null>(null);
  const list = folders.data ?? [];
  const nameOf = (id: string | null) => list.find((f) => f.id === id)?.name;

  const save = async () => {
    if (!editing) return;
    const body = { ...editing.form, name: editing.form.name.trim() };
    if (!body.name) throw new Error('Enter a folder name');
    await write.mutateAsync(() =>
      editing.id ? api.admin.folders.update(editing.id, body) : api.admin.folders.create(body),
    );
  };

  return (
    <>
      <SectionHeader
        title="Folders"
        description="Folders in the left pane. Routing rules file enquiries into them; officers can also move enquiries by hand. Lower order numbers show first."
        addLabel="New folder"
        onAdd={() => setEditing({ id: null, form: { name: '', order: (list.at(-1)?.order ?? 0) + 1, parentId: null } })}
      />
      <ListState query={folders} empty={list.length === 0}>
        <Table size="small" aria-label="Folders" style={{ minWidth: 460 }}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell style={{ width: 160 }}>Inside</TableHeaderCell>
              <TableHeaderCell style={{ width: 80 }}>Order</TableHeaderCell>
              <TableHeaderCell style={{ width: 96 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <FolderRegular aria-hidden />
                    {f.name}
                  </span>
                </TableCell>
                <TableCell>{nameOf(f.parentId) ?? '—'}</TableCell>
                <TableCell>{f.order}</TableCell>
                <TableCell>
                  <div className={styles.rowActions}>
                    <Button
                      appearance="subtle"
                      icon={<EditRegular />}
                      aria-label={`Edit ${f.name}`}
                      onClick={() =>
                        setEditing({ id: f.id, form: { name: f.name, order: f.order, parentId: f.parentId } })
                      }
                    />
                    <Button
                      appearance="subtle"
                      icon={<DeleteRegular />}
                      aria-label={`Delete ${f.name}`}
                      onClick={() => setDeleting(f)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListState>

      <EditDialog
        open={editing !== null}
        title={editing?.id ? 'Edit folder' : 'New folder'}
        onClose={() => setEditing(null)}
        onSave={save}
      >
        {editing && (
          <>
            <Field label="Name" required>
              <Input
                value={editing.form.name}
                autoFocus
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, name: d.value } })}
              />
            </Field>
            <Field label="Inside" hint="Optional: make it a sub-folder.">
              <Dropdown
                value={nameOf(editing.form.parentId) ?? 'Top level'}
                selectedOptions={[editing.form.parentId ?? '']}
                onOptionSelect={(_, d) =>
                  setEditing({ ...editing, form: { ...editing.form, parentId: d.optionValue || null } })
                }
              >
                <Option value="">Top level</Option>
                {list
                  .filter((f) => f.id !== editing.id && !f.parentId)
                  .map((f) => (
                    <Option key={f.id} value={f.id}>
                      {f.name}
                    </Option>
                  ))}
              </Dropdown>
            </Field>
            <Field label="Order">
              <SpinButton
                value={editing.form.order}
                min={0}
                max={10000}
                onChange={(_, d) => {
                  const order = d.value ?? Number(d.displayValue);
                  if (Number.isFinite(order)) setEditing({ ...editing, form: { ...editing.form, order: order! } });
                }}
              />
            </Field>
          </>
        )}
      </EditDialog>

      <ConfirmDelete
        what={deleting && `the folder “${deleting.name}”`}
        consequence="Enquiries in it are not deleted; they stay in All enquiries without a folder."
        onClose={() => setDeleting(null)}
        onConfirm={() => write.mutateAsync(() => api.admin.folders.remove(deleting!.id)).then(() => undefined)}
      />
    </>
  );
}

// ── Categories ───────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<CategoryType, string> = { enquiry: 'Enquiry type', status: 'Status', officer: 'Officer' };
type CategoryForm = Omit<CategoryDto, 'id'>;

export function CategoriesAdmin() {
  const styles = useAdminStyles();
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories });
  const write = useAdminWrite(['categories'], ['tickets']);
  const [editing, setEditing] = useState<{ id: string | null; form: CategoryForm } | null>(null);
  const [deleting, setDeleting] = useState<CategoryDto | null>(null);
  const list = categories.data ?? [];

  const save = async () => {
    if (!editing) return;
    const body = { ...editing.form, name: editing.form.name.trim() };
    if (!body.name) throw new Error('Enter a category name');
    await write.mutateAsync(() =>
      editing.id ? api.admin.categories.update(editing.id, body) : api.admin.categories.create(body),
    );
  };

  return (
    <>
      <SectionHeader
        title="Categories"
        description="Colour labels shown on enquiries, as in Outlook. Several can be applied to one enquiry."
        addLabel="New category"
        onAdd={() => setEditing({ id: null, form: { name: '', type: 'enquiry', color: CATEGORY_COLORS[5].hex } })}
      />
      <ListState query={categories} empty={list.length === 0}>
        <Table size="small" aria-label="Categories" style={{ minWidth: 460 }}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell style={{ width: 180 }}>Kind</TableHeaderCell>
              <TableHeaderCell style={{ width: 96 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <CategorySwatch color={c.color} />
                    <CategoryPill category={c} />
                  </span>
                </TableCell>
                <TableCell>{TYPE_LABEL[c.type]}</TableCell>
                <TableCell>
                  <div className={styles.rowActions}>
                    <Button
                      appearance="subtle"
                      icon={<EditRegular />}
                      aria-label={`Edit ${c.name}`}
                      onClick={() => setEditing({ id: c.id, form: { name: c.name, type: c.type, color: c.color } })}
                    />
                    <Button
                      appearance="subtle"
                      icon={<DeleteRegular />}
                      aria-label={`Delete ${c.name}`}
                      onClick={() => setDeleting(c)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListState>

      <EditDialog
        open={editing !== null}
        title={editing?.id ? 'Edit category' : 'New category'}
        onClose={() => setEditing(null)}
        onSave={save}
      >
        {editing && (
          <>
            <Field label="Name" required>
              <Input
                value={editing.form.name}
                autoFocus
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, name: d.value } })}
              />
            </Field>
            <Field label="Kind">
              <RadioGroup
                layout="horizontal"
                value={editing.form.type}
                onChange={(_, d) =>
                  setEditing({ ...editing, form: { ...editing.form, type: d.value as CategoryType } })
                }
              >
                {CATEGORY_TYPES.map((t) => (
                  <Radio key={t} value={t} label={TYPE_LABEL[t]} />
                ))}
              </RadioGroup>
            </Field>
            <Field label="Colour">
              <RadioGroup
                layout="horizontal"
                value={editing.form.color}
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, color: d.value } })}
                className="flex-wrap"
              >
                {CATEGORY_COLORS.map((c) => (
                  <Radio
                    key={c.hex}
                    value={c.hex}
                    label={
                      <span className="flex items-center gap-1.5">
                        <CategorySwatch color={c.hex} />
                        {c.name}
                      </span>
                    }
                  />
                ))}
              </RadioGroup>
            </Field>
            <Field label="Preview">
              <span>
                <CategoryPill category={{ id: 'preview', ...editing.form, name: editing.form.name || 'Category' }} />
              </span>
            </Field>
          </>
        )}
      </EditDialog>

      <ConfirmDelete
        what={deleting && `the category “${deleting.name}”`}
        consequence="It is removed from every enquiry that has it."
        onClose={() => setDeleting(null)}
        onConfirm={() => write.mutateAsync(() => api.admin.categories.remove(deleting!.id)).then(() => undefined)}
      />
    </>
  );
}
