'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Radio,
  RadioGroup,
  SpinButton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
} from '@fluentui/react-components';
import { DeleteRegular, EditRegular, PeopleTeamRegular, PersonRegular } from '@fluentui/react-icons';
import { ROLES, type AdminUserDto, type DepartmentDto, type DepartmentType, type Role } from '@/lib/shared';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { formatFullDateTime } from '@/lib/format';
import {
  ConfirmDelete,
  EditDialog,
  friendlyError,
  ListState,
  SectionHeader,
  useAdminStyles,
  useAdminWrite,
} from './common';

// ── Departments (escalation directory) ───────────────────────────────────────

type DepartmentForm = Omit<DepartmentDto, 'id'>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DepartmentsAdmin() {
  const styles = useAdminStyles();
  const departments = useQuery({ queryKey: ['departments', 'all'], queryFn: () => api.departments({ all: true }) });
  const mailbox = useQuery({ queryKey: ['mailbox'], queryFn: api.mailbox });
  const write = useAdminWrite(['departments']);
  const [editing, setEditing] = useState<{ id: string | null; form: DepartmentForm } | null>(null);
  const [deleting, setDeleting] = useState<DepartmentDto | null>(null);
  const list = departments.data ?? [];
  const allowlist = mailbox.data?.sendAllowlist;

  const save = async () => {
    if (!editing) return;
    const body = { ...editing.form, name: editing.form.name.trim(), email: editing.form.email.trim() };
    if (!body.name) throw new Error('Enter a name');
    if (!EMAIL.test(body.email)) throw new Error('Enter a valid email address');
    await write.mutateAsync(() =>
      editing.id ? api.admin.departments.update(editing.id, body) : api.admin.departments.create(body),
    );
  };

  return (
    <>
      <SectionHeader
        title="Departments"
        description="Teams and people officers can escalate to. They appear in each enquiry's Escalate menu, in this order; escalating forwards the thread to the email address here."
        addLabel="New entry"
        onAdd={() =>
          setEditing({
            id: null,
            form: {
              name: '',
              email: '',
              type: 'department',
              description: '',
              order: (list.at(-1)?.order ?? 0) + 1,
              isActive: true,
            },
          })
        }
      />
      {allowlist && (
        <MessageBar intent="warning" className="mb-3">
          <MessageBarBody>
            Test mode: this server only sends email to {allowlist.join(', ')}. Escalating to any other address will be
            refused until MAIL_SEND_ALLOWLIST is cleared in production.
          </MessageBarBody>
        </MessageBar>
      )}
      <ListState query={departments} empty={list.length === 0}>
        <Table size="small" aria-label="Departments" style={{ minWidth: 760 }}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>When to escalate here</TableHeaderCell>
              <TableHeaderCell style={{ width: 70 }}>Order</TableHeaderCell>
              <TableHeaderCell style={{ width: 96 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((d) => (
              <TableRow key={d.id} className={d.isActive ? undefined : styles.inactive}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {d.type === 'person' ? (
                      <PersonRegular aria-label="Person" />
                    ) : (
                      <PeopleTeamRegular aria-label="Team" />
                    )}
                    {d.name}
                    {!d.isActive && (
                      <Badge appearance="outline" color="subtle" size="small">
                        Hidden
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{d.email}</TableCell>
                <TableCell>{d.description || '—'}</TableCell>
                <TableCell>{d.order}</TableCell>
                <TableCell>
                  <div className={styles.rowActions}>
                    <Button
                      appearance="subtle"
                      icon={<EditRegular />}
                      aria-label={`Edit ${d.name}`}
                      onClick={() => {
                        const { id, ...form } = d;
                        setEditing({ id, form });
                      }}
                    />
                    <Button
                      appearance="subtle"
                      icon={<DeleteRegular />}
                      aria-label={`Delete ${d.name}`}
                      onClick={() => setDeleting(d)}
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
        title={editing?.id ? 'Edit escalation contact' : 'New escalation contact'}
        onClose={() => setEditing(null)}
        onSave={save}
      >
        {editing && (
          <>
            <Field label="Type">
              <RadioGroup
                layout="horizontal"
                value={editing.form.type}
                onChange={(_, d) =>
                  setEditing({ ...editing, form: { ...editing.form, type: d.value as DepartmentType } })
                }
              >
                <Radio value="department" label="Team or department" />
                <Radio value="person" label="Named person" />
              </RadioGroup>
            </Field>
            <Field label="Name" required>
              <Input
                value={editing.form.name}
                autoFocus
                placeholder={editing.form.type === 'person' ? 'e.g. Mr Y — Operations' : 'e.g. Legal / Probate'}
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, name: d.value } })}
              />
            </Field>
            <Field label="Email" required hint="Escalations are forwarded here from the shared mailbox.">
              <Input
                type="email"
                value={editing.form.email}
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, email: d.value } })}
              />
            </Field>
            <Field label="When to escalate here" hint="Shown as a hint in the Escalate menu.">
              <Textarea
                value={editing.form.description}
                rows={2}
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, description: d.value } })}
              />
            </Field>
            <div className="flex flex-wrap items-end gap-6">
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
              <Switch
                label="Show in the Escalate menu"
                checked={editing.form.isActive}
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, isActive: d.checked } })}
              />
            </div>
          </>
        )}
      </EditDialog>

      <ConfirmDelete
        what={deleting && `“${deleting.name}”`}
        consequence="Enquiries already escalated there keep their history. To stop offering it but keep it on file, turn off “Show in the Escalate menu” instead."
        onClose={() => setDeleting(null)}
        onConfirm={() => write.mutateAsync(() => api.admin.departments.remove(deleting!.id)).then(() => undefined)}
      />
    </>
  );
}

// ── Users and roles ──────────────────────────────────────────────────────────

const ROLE_LABEL: Record<Role, string> = { agent: 'Agent', supervisor: 'Supervisor', admin: 'Admin' };
const ROLE_HINT: Record<Role, string> = {
  agent: 'Works enquiries; can take and release their own',
  supervisor: 'Also assigns to others, sees the team dashboard, edits templates',
  admin: 'Also manages everything under Admin',
};

type PersonForm = { displayName: string; email: string; role: Role };

export function UsersAdmin() {
  const styles = useAdminStyles();
  const me = useCurrentUser();
  const users = useQuery({ queryKey: ['admin-users'], queryFn: api.admin.users });
  const write = useAdminWrite(['admin-users'], ['users']);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: PersonForm } | null>(null);
  const [removing, setRemoving] = useState<AdminUserDto | null>(null);
  const list = users.data ?? [];

  const patch = (id: string, body: { role?: Role; isActive?: boolean }) => {
    setError(null);
    write.mutate(() => api.admin.patchUser(id, body), { onError: (err) => setError(friendlyError(err)) });
  };

  const save = async () => {
    if (!editing) return;
    const { form } = editing;
    const displayName = form.displayName.trim();
    const email = form.email.trim().toLowerCase();
    if (!displayName) throw new Error('Enter their name');
    if (!EMAIL.test(email)) throw new Error('Enter a valid email address');
    await write.mutateAsync(() =>
      editing.id
        ? api.admin.patchUser(editing.id, { displayName, email })
        : api.admin.createUser({ displayName, email, role: form.role }),
    );
  };

  return (
    <>
      <SectionHeader
        title="Users"
        description="Only people on this list can sign in. Add staff and choose their role; their first sign-in with that Microsoft account links to their entry here. Disable an account to stop someone signing in (their history is kept)."
        addLabel="Add person"
        onAdd={() => setEditing({ id: null, form: { displayName: '', email: '', role: 'agent' } })}
      />
      {error && (
        <MessageBar intent="error" className="mb-3">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <ListState query={users} empty={list.length === 0}>
        <Table size="small" aria-label="Users" style={{ minWidth: 780 }}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell style={{ width: 200 }}>Role</TableHeaderCell>
              <TableHeaderCell style={{ width: 200 }}>Last signed in</TableHeaderCell>
              <TableHeaderCell style={{ width: 140 }}>Can sign in</TableHeaderCell>
              <TableHeaderCell style={{ width: 96 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((u) => {
              const isMe = u.id === me.id;
              return (
                <TableRow key={u.id} className={u.isActive ? undefined : styles.inactive}>
                  <TableCell>
                    <span className="flex items-center gap-2 py-1">
                      <Avatar name={u.displayName} size={28} color={u.isActive ? 'colorful' : 'neutral'} />
                      <span className="flex min-w-0 flex-col">
                        <Text>
                          {u.displayName}
                          {isMe && ' (you)'}
                          {u.pending && (
                            <Badge appearance="outline" color="informative" size="small" className="ml-2">
                              Invited
                            </Badge>
                          )}
                        </Text>
                        <Text size={200} className={styles.muted}>
                          {u.email}
                        </Text>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Dropdown
                      size="small"
                      aria-label={`Role for ${u.displayName}`}
                      value={ROLE_LABEL[u.role]}
                      selectedOptions={[u.role]}
                      disabled={isMe}
                      onOptionSelect={(_, d) =>
                        d.optionValue !== u.role && patch(u.id, { role: d.optionValue as Role })
                      }
                      style={{ minWidth: 150 }}
                    >
                      {ROLES.map((r) => (
                        <Option key={r} value={r} text={ROLE_LABEL[r]}>
                          <span className="flex flex-col">
                            <span>{ROLE_LABEL[r]}</span>
                            <Text size={200} className={styles.muted}>
                              {ROLE_HINT[r]}
                            </Text>
                          </span>
                        </Option>
                      ))}
                    </Dropdown>
                  </TableCell>
                  <TableCell>
                    {u.lastSignInAt ? formatFullDateTime(u.lastSignInAt) : u.pending ? 'Not yet' : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`${u.displayName} can sign in`}
                      checked={u.isActive}
                      disabled={isMe}
                      onChange={(_, d) => patch(u.id, { isActive: d.checked })}
                    />
                  </TableCell>
                  <TableCell>
                    {u.pending && (
                      <div className={styles.rowActions}>
                        <Button
                          appearance="subtle"
                          icon={<EditRegular />}
                          aria-label={`Edit ${u.displayName}`}
                          onClick={() =>
                            setEditing({ id: u.id, form: { displayName: u.displayName, email: u.email, role: u.role } })
                          }
                        />
                        <Button
                          appearance="subtle"
                          icon={<DeleteRegular />}
                          aria-label={`Remove ${u.displayName}`}
                          onClick={() => setRemoving(u)}
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ListState>

      <EditDialog
        open={editing !== null}
        title={editing?.id ? 'Edit person' : 'Add person'}
        saveLabel={editing?.id ? 'Save' : 'Add'}
        onClose={() => setEditing(null)}
        onSave={save}
      >
        {editing && (
          <>
            <Field label="Name" required>
              <Input
                value={editing.form.displayName}
                autoFocus
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, displayName: d.value } })}
              />
            </Field>
            <Field
              label="Microsoft sign-in email"
              required
              hint="The address they sign in to Microsoft with, e.g. name@firstregistrarsnigeria.com. Their first sign-in links to this entry."
            >
              <Input
                type="email"
                value={editing.form.email}
                onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, email: d.value } })}
              />
            </Field>
            {!editing.id && (
              <Field label="Role">
                <RadioGroup
                  value={editing.form.role}
                  onChange={(_, d) => setEditing({ ...editing, form: { ...editing.form, role: d.value as Role } })}
                >
                  {ROLES.map((r) => (
                    <Radio key={r} value={r} label={`${ROLE_LABEL[r]} — ${ROLE_HINT[r]}`} />
                  ))}
                </RadioGroup>
              </Field>
            )}
          </>
        )}
      </EditDialog>

      <ConfirmDelete
        what={removing && `${removing.displayName} (${removing.email})`}
        consequence="They haven’t signed in yet, so nothing else changes. They won’t be able to sign in unless you add them again."
        onClose={() => setRemoving(null)}
        onConfirm={() => write.mutateAsync(() => api.admin.removeUser(removing!.id)).then(() => undefined)}
      />
    </>
  );
}
