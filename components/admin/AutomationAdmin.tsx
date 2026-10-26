'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Checkbox,
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
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular, DismissRegular, EditRegular, EyeRegular } from '@fluentui/react-icons';
import {
  PRIORITY_LABELS,
  TICKET_PRIORITIES,
  type AssignmentRuleDto,
  type RuleConditionDto,
  type SlaPolicyDto,
  type TicketPriority,
} from '@/lib/shared';
import { api } from '@/lib/api';
import { CategoryPill } from '@/components/mail/CategoryPill';
import { ASSIGNMENT_METHODS } from './SettingsAdmin';
import {
  ConfirmDelete,
  EditDialog,
  ListState,
  OfficerPoolPicker,
  reservedOfficers,
  SectionHeader,
  useAdminStyles,
  useAdminWrite,
  useLookups,
} from './common';

const FIELD_LABEL: Record<RuleConditionDto['field'], string> = {
  subject: 'Subject',
  fromEmail: 'Sender address',
  fromDomain: 'Sender domain',
  body: 'Message text',
};
const OP_LABEL: Record<RuleConditionDto['op'], string> = { contains: 'contains', equals: 'is' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Routing rules ────────────────────────────────────────────────────────────

type RuleForm = Omit<AssignmentRuleDto, 'id'>;

const emptyRule = (priority: number): RuleForm => ({
  name: '',
  priority,
  isActive: true,
  conditions: [{ field: 'subject', op: 'contains', value: '' }],
  action: { setFolderId: null, addCategoryIds: [], assignStrategy: 'round_robin', assigneeId: null, redirectTo: null },
  roundRobinPool: [],
});

export function RulesAdmin({ readOnly }: { readOnly: boolean }) {
  const styles = useAdminStyles();
  const lookups = useLookups();
  const rules = useQuery({ queryKey: ['assignment-rules'], queryFn: api.admin.rulesList });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.admin.settings, enabled: !readOnly });
  const write = useAdminWrite(['assignment-rules']);
  const [editing, setEditing] = useState<{ id: string | null; form: RuleForm } | null>(null);
  const [deleting, setDeleting] = useState<AssignmentRuleDto | null>(null);
  const list = rules.data ?? [];

  const reservedBy = (exceptRuleId: string | null) => reservedOfficers(list, exceptRuleId);

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    const body: RuleForm = {
      ...f,
      name: f.name.trim(),
      conditions: f.conditions.map((c) => ({ ...c, value: c.value.trim() })).filter((c) => c.value),
      action: { ...f.action, redirectTo: f.action.redirectTo?.trim() || null },
      roundRobinPool: f.action.assignStrategy === 'round_robin' ? f.roundRobinPool : [],
    };
    if (!body.name) throw new Error('Give the rule a name');
    if (body.conditions.length === 0) throw new Error('Add at least one condition with a value');
    if (body.isActive && !body.action.assignStrategy)
      throw new Error("A rule that's switched on must assign an officer or a pool of officers");
    if (body.action.assignStrategy === 'specific' && !body.action.assigneeId)
      throw new Error('Choose who to assign to');
    if (body.action.assignStrategy === 'round_robin' && body.roundRobinPool.length === 0) {
      throw new Error('Choose the officers to rotate between');
    }
    if (body.action.redirectTo && !EMAIL.test(body.action.redirectTo))
      throw new Error('Enter a valid redirect address');
    await write.mutateAsync(() =>
      editing.id ? api.admin.rules.update(editing.id, body) : api.admin.rules.create(body),
    );
  };

  const describeAction = (r: AssignmentRuleDto) => {
    const parts: React.ReactNode[] = [];
    if (r.action.setFolderId) parts.push(<span key="f">File in {lookups.folderName(r.action.setFolderId)}</span>);
    for (const c of r.action.addCategoryIds) {
      const cat = lookups.categories.find((x) => x.id === c);
      if (cat) parts.push(<CategoryPill key={c} category={cat} />);
    }
    if (r.action.assignStrategy === 'specific')
      parts.push(<span key="a">Assign to {lookups.officerName(r.action.assigneeId)}</span>);
    if (r.action.assignStrategy === 'round_robin') {
      const reserved = reservedBy(r.id);
      const skipped = r.roundRobinPool.filter((id) => reserved.has(id)).length;
      parts.push(
        <span key="r">
          Officer pool ({r.roundRobinPool.length}
          {skipped > 0 && `, ${skipped} skipped`})
        </span>,
      );
    }
    if (r.action.redirectTo) parts.push(<span key="x">Redirect to {r.action.redirectTo}</span>);
    return <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{parts}</span>;
  };

  const set = (patch: Partial<RuleForm>) => setEditing((e) => e && { ...e, form: { ...e.form, ...patch } });
  const setAction = (patch: Partial<RuleForm['action']>) =>
    setEditing((e) => e && { ...e, form: { ...e.form, action: { ...e.form.action, ...patch } } });
  const setCondition = (i: number, patch: Partial<RuleConditionDto>) =>
    setEditing(
      (e) =>
        e && {
          ...e,
          form: { ...e.form, conditions: e.form.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) },
        },
    );

  return (
    <>
      <SectionHeader
        title="Rules"
        description="Rules run on each new email enquiry, lowest priority number first. All conditions must match. The first matching rule sets the folder and assignment; categories from every matching rule are added."
        addLabel={readOnly ? undefined : 'New rule'}
        onAdd={
          readOnly ? undefined : () => setEditing({ id: null, form: emptyRule((list.at(-1)?.priority ?? 0) + 10) })
        }
      />
      {settings.data && !settings.data.roundRobinEnabled && (
        <MessageBar intent="warning" className="mb-3">
          <MessageBarBody>
            Automatic assignment is switched off in Settings, so officer-pool rules don&apos;t assign anyone.
          </MessageBarBody>
        </MessageBar>
      )}
      <ListState query={rules} empty={list.length === 0}>
        <Table size="small" aria-label="Rules" style={{ minWidth: 920 }}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell style={{ width: 70 }}>Priority</TableHeaderCell>
              <TableHeaderCell style={{ width: 200 }}>Name</TableHeaderCell>
              <TableHeaderCell style={{ width: 130 }}>Status</TableHeaderCell>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>Then</TableHeaderCell>
              <TableHeaderCell style={{ width: 96 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={r.id} className={r.isActive ? undefined : styles.inactive}>
                <TableCell>{r.priority}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>
                  {!r.isActive ? (
                    <Badge appearance="outline" color="subtle" className="whitespace-nowrap">
                      Off
                    </Badge>
                  ) : !r.action.assignStrategy ? (
                    <Badge
                      appearance="tint"
                      color="warning"
                      className="whitespace-nowrap"
                      title="Switched on but assigns nobody. Edit it to choose officers, or switch it off."
                    >
                      No assignee
                    </Badge>
                  ) : (
                    <Badge appearance="tint" color="success" className="whitespace-nowrap">
                      On
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {r.conditions.map((c, i) => (
                    <div key={i}>
                      {FIELD_LABEL[c.field]} {OP_LABEL[c.op]} “{c.value}”
                    </div>
                  ))}
                </TableCell>
                <TableCell>{describeAction(r)}</TableCell>
                <TableCell>
                  <div className={styles.rowActions}>
                    <Button
                      appearance="subtle"
                      icon={readOnly ? <EyeRegular /> : <EditRegular />}
                      aria-label={`${readOnly ? 'View' : 'Edit'} ${r.name}`}
                      onClick={() => {
                        const { id, ...form } = r;
                        setEditing({ id, form });
                      }}
                    />
                    {!readOnly && (
                      <Button
                        appearance="subtle"
                        icon={<DeleteRegular />}
                        aria-label={`Delete ${r.name}`}
                        onClick={() => setDeleting(r)}
                      />
                    )}
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
        title={readOnly ? 'Rule' : editing?.id ? 'Edit rule' : 'New rule'}
        onClose={() => setEditing(null)}
        onSave={readOnly ? async () => undefined : save}
        saveLabel={readOnly ? 'Close' : 'Save'}
      >
        {editing && (
          <fieldset disabled={readOnly} className="m-0 flex flex-col gap-3 border-0 p-0">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
              <Field label="Name" required>
                <Input value={editing.form.name} autoFocus onChange={(_, d) => set({ name: d.value })} />
              </Field>
              <Field label="Priority" hint="Lower runs first">
                <SpinButton
                  value={editing.form.priority}
                  min={0}
                  max={100000}
                  onChange={(_, d) => {
                    const v = d.value ?? Number(d.displayValue);
                    if (Number.isFinite(v)) set({ priority: v! });
                  }}
                />
              </Field>
              <Switch
                label="On"
                checked={editing.form.isActive}
                onChange={(_, d) =>
                  // A rule that's on must assign someone: default to a pool so the officer picker opens.
                  setEditing(
                    (e) =>
                      e && {
                        ...e,
                        form: {
                          ...e.form,
                          isActive: d.checked,
                          action:
                            d.checked && !e.form.action.assignStrategy
                              ? { ...e.form.action, assignStrategy: 'round_robin' }
                              : e.form.action,
                        },
                      },
                  )
                }
              />
            </div>

            <Text weight="semibold">When a new email arrives where…</Text>
            {editing.form.conditions.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[170px_120px_1fr_auto] sm:items-center">
                <Dropdown
                  aria-label="Field"
                  value={FIELD_LABEL[c.field]}
                  selectedOptions={[c.field]}
                  onOptionSelect={(_, d) => setCondition(i, { field: d.optionValue as RuleConditionDto['field'] })}
                  style={{ minWidth: 0 }}
                >
                  {Object.entries(FIELD_LABEL).map(([k, v]) => (
                    <Option key={k} value={k}>
                      {v}
                    </Option>
                  ))}
                </Dropdown>
                <Dropdown
                  aria-label="Comparison"
                  value={OP_LABEL[c.op]}
                  selectedOptions={[c.op]}
                  onOptionSelect={(_, d) => setCondition(i, { op: d.optionValue as RuleConditionDto['op'] })}
                  style={{ minWidth: 0 }}
                >
                  <Option value="contains">contains</Option>
                  <Option value="equals">is</Option>
                </Dropdown>
                <Input
                  aria-label="Value"
                  value={c.value}
                  placeholder={c.field === 'fromDomain' ? 'e.g. lawfirm.com' : 'e.g. dividend'}
                  onChange={(_, d) => setCondition(i, { value: d.value })}
                />
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  aria-label="Remove condition"
                  disabled={editing.form.conditions.length === 1}
                  onClick={() => set({ conditions: editing.form.conditions.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
            {!readOnly && editing.form.conditions.length < 10 && (
              <span>
                <Button
                  appearance="subtle"
                  icon={<AddRegular />}
                  onClick={() =>
                    set({ conditions: [...editing.form.conditions, { field: 'subject', op: 'contains', value: '' }] })
                  }
                >
                  And…
                </Button>
              </span>
            )}

            <Text weight="semibold">Then…</Text>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="File in folder">
                <Dropdown
                  value={lookups.folderName(editing.form.action.setFolderId) ?? 'Leave as is'}
                  selectedOptions={[editing.form.action.setFolderId ?? '']}
                  onOptionSelect={(_, d) => setAction({ setFolderId: d.optionValue || null })}
                >
                  <Option value="">Leave as is</Option>
                  {lookups.folders.map((f) => (
                    <Option key={f.id} value={f.id}>
                      {f.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Add categories">
                <Dropdown
                  multiselect
                  placeholder="None"
                  value={editing.form.action.addCategoryIds.map(lookups.categoryName).join(', ')}
                  selectedOptions={editing.form.action.addCategoryIds}
                  onOptionSelect={(_, d) => setAction({ addCategoryIds: d.selectedOptions })}
                >
                  {lookups.categories.map((c) => (
                    <Option key={c.id} value={c.id}>
                      {c.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>
            <Field
              label="Assign"
              hint={editing.form.isActive ? 'Switch the rule off to file or redirect without assigning.' : undefined}
            >
              <RadioGroup
                layout="horizontal"
                value={editing.form.action.assignStrategy ?? 'none'}
                onChange={(_, d) =>
                  setAction({ assignStrategy: d.value === 'none' ? null : (d.value as 'round_robin' | 'specific') })
                }
              >
                <Radio value="none" label="Don't assign" disabled={editing.form.isActive} />
                <Radio value="specific" label="To one officer" />
                <Radio value="round_robin" label="From a pool of officers" />
              </RadioGroup>
            </Field>
            {editing.form.action.assignStrategy === 'specific' && (
              <Field
                label="Officer"
                required
                hint={(() => {
                  const id = editing.form.action.assigneeId;
                  const pools = list.filter(
                    (r) =>
                      r.id !== editing.id &&
                      r.action.assignStrategy === 'round_robin' &&
                      id &&
                      r.roundRobinPool.includes(id),
                  );
                  return editing.form.isActive && pools.length > 0
                    ? `They'll be skipped in the pools of: ${pools.map((r) => r.name).join(', ')}.`
                    : undefined;
                })()}
              >
                <Dropdown
                  placeholder="Choose an officer"
                  value={lookups.officerName(editing.form.action.assigneeId) ?? ''}
                  selectedOptions={editing.form.action.assigneeId ? [editing.form.action.assigneeId] : []}
                  onOptionSelect={(_, d) => setAction({ assigneeId: d.optionValue ?? null })}
                >
                  {lookups.officers.map((o) => (
                    <Option key={o.id} value={o.id}>
                      {o.displayName}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            )}
            {editing.form.action.assignStrategy === 'round_robin' && (
              <Field
                label="Officer pool"
                required
                hint={`Who gets each new matching enquiry follows the assignment method in Settings${
                  settings.data ? ` (now: ${ASSIGNMENT_METHODS[settings.data.assignmentMode].label})` : ''
                }. Disabled accounts and officers assigned directly by an active rule are skipped; the latter can't be added.`}
              >
                <OfficerPoolPicker
                  value={editing.form.roundRobinPool}
                  onChange={(ids) => set({ roundRobinPool: ids })}
                  reserved={reservedBy(editing.id)}
                />
              </Field>
            )}
            <Field
              label="Redirect to"
              hint="Optional: also forward matching emails to this address (e.g. another team's mailbox)."
            >
              <Input
                type="email"
                value={editing.form.action.redirectTo ?? ''}
                onChange={(_, d) => setAction({ redirectTo: d.value || null })}
              />
            </Field>
          </fieldset>
        )}
      </EditDialog>

      <ConfirmDelete
        what={deleting && `the rule “${deleting.name}”`}
        consequence="Enquiries it already filed stay where they are."
        onClose={() => setDeleting(null)}
        onConfirm={() => write.mutateAsync(() => api.admin.rules.remove(deleting!.id)).then(() => undefined)}
      />
    </>
  );
}

// ── SLA policies ─────────────────────────────────────────────────────────────

type SlaForm = Omit<SlaPolicyDto, 'id'>;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const hoursText = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h ? `${h}h` : ''}${m ? ` ${m}m` : ''}`.trim() || '0m';
};

export function SlaAdmin({ readOnly }: { readOnly: boolean }) {
  const styles = useAdminStyles();
  const lookups = useLookups();
  const policies = useQuery({ queryKey: ['sla-policies'], queryFn: api.admin.slaList });
  const write = useAdminWrite(['sla-policies']);
  const [editing, setEditing] = useState<{ id: string | null; form: SlaForm } | null>(null);
  const [deleting, setDeleting] = useState<SlaPolicyDto | null>(null);
  const list = policies.data ?? [];

  const set = (patch: Partial<SlaForm>) => setEditing((e) => e && { ...e, form: { ...e.form, ...patch } });
  const setHours = (patch: Partial<SlaForm['businessHours']>) =>
    setEditing((e) => e && { ...e, form: { ...e.form, businessHours: { ...e.form.businessHours, ...patch } } });
  const setApplies = (patch: Partial<SlaForm['appliesTo']>) =>
    setEditing((e) => e && { ...e, form: { ...e.form, appliesTo: { ...e.form.appliesTo, ...patch } } });

  const save = async () => {
    if (!editing) return;
    const body = { ...editing.form, name: editing.form.name.trim() };
    if (!body.name) throw new Error('Give the policy a name');
    if (body.businessHours.start >= body.businessHours.end) throw new Error('Closing time must be after opening time');
    if (body.businessHours.days.length === 0) throw new Error('Choose at least one working day');
    await write.mutateAsync(() =>
      editing.id ? api.admin.slaPolicies.update(editing.id, body) : api.admin.slaPolicies.create(body),
    );
  };

  const appliesText = (p: SlaPolicyDto) => {
    const parts = [
      p.appliesTo.folderId && `folder ${lookups.folderName(p.appliesTo.folderId)}`,
      p.appliesTo.categoryId && `category ${lookups.categoryName(p.appliesTo.categoryId)}`,
      p.appliesTo.priority && `${PRIORITY_LABELS[p.appliesTo.priority].toLowerCase()} priority`,
    ].filter(Boolean);
    return parts.length ? parts.join(' + ') : 'Everything else (default)';
  };

  const minutesField = (label: string, key: 'firstResponseMins' | 'resolutionMins', hint: string) =>
    editing && (
      <Field label={label} hint={`${hint} In working hours: ${hoursText(editing.form[key])}.`}>
        <SpinButton
          value={editing.form[key] / 60}
          min={0.25}
          max={key === 'firstResponseMins' ? 1440 : 4320}
          step={0.5}
          displayValue={`${editing.form[key] / 60} working hours`}
          onChange={(_, d) => {
            const hours = d.value ?? parseFloat(d.displayValue ?? '');
            if (Number.isFinite(hours) && hours! > 0) set({ [key]: Math.round(hours! * 60) } as Partial<SlaForm>);
          }}
        />
      </Field>
    );

  return (
    <>
      <SectionHeader
        title="SLA"
        description="Targets for first reply and for resolution, counted in working hours. Each enquiry gets the most specific matching policy; one with no conditions is the default. When a target passes, the enquiry turns overdue and the supervisor is emailed. Saving a change updates the due times of all open enquiries within a minute or so; enquiries the change makes overdue are flagged quietly, without alert emails."
        addLabel={readOnly ? undefined : 'New policy'}
        onAdd={
          readOnly
            ? undefined
            : () =>
                setEditing({
                  id: null,
                  form: {
                    name: '',
                    isActive: true,
                    appliesTo: { folderId: null, categoryId: null, priority: null },
                    firstResponseMins: 540,
                    resolutionMins: 1620,
                    businessHours: { tz: 'Africa/Lagos', days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00' },
                    escalateToUserId: null,
                  },
                })
        }
      />
      <ListState query={policies} empty={list.length === 0}>
        <Table size="small" aria-label="SLA policies" style={{ minWidth: 960 }}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell style={{ width: 180 }}>Name</TableHeaderCell>
              <TableHeaderCell>Applies to</TableHeaderCell>
              <TableHeaderCell style={{ width: 110 }}>First reply</TableHeaderCell>
              <TableHeaderCell style={{ width: 110 }}>Resolve</TableHeaderCell>
              <TableHeaderCell>Working hours</TableHeaderCell>
              <TableHeaderCell>Supervisor</TableHeaderCell>
              <TableHeaderCell style={{ width: 96 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((p) => (
              <TableRow key={p.id} className={p.isActive ? undefined : styles.inactive}>
                <TableCell>
                  {p.name}
                  {!p.isActive && ' (off)'}
                </TableCell>
                <TableCell>{appliesText(p)}</TableCell>
                <TableCell>{hoursText(p.firstResponseMins)}</TableCell>
                <TableCell>{hoursText(p.resolutionMins)}</TableCell>
                <TableCell>
                  {p.businessHours.days.map((d) => DAYS[d - 1]).join(', ')} {p.businessHours.start}–
                  {p.businessHours.end}
                </TableCell>
                <TableCell>{lookups.officerName(p.escalateToUserId) ?? '—'}</TableCell>
                <TableCell>
                  <div className={styles.rowActions}>
                    <Button
                      appearance="subtle"
                      icon={readOnly ? <EyeRegular /> : <EditRegular />}
                      aria-label={`${readOnly ? 'View' : 'Edit'} ${p.name}`}
                      onClick={() => {
                        const { id, ...form } = p;
                        setEditing({ id, form });
                      }}
                    />
                    {!readOnly && (
                      <Button
                        appearance="subtle"
                        icon={<DeleteRegular />}
                        aria-label={`Delete ${p.name}`}
                        onClick={() => setDeleting(p)}
                      />
                    )}
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
        title={readOnly ? 'SLA policy' : editing?.id ? 'Edit SLA policy' : 'New SLA policy'}
        onClose={() => setEditing(null)}
        onSave={readOnly ? async () => undefined : save}
        saveLabel={readOnly ? 'Close' : 'Save'}
      >
        {editing && (
          <fieldset disabled={readOnly} className="m-0 flex flex-col gap-3 border-0 p-0">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Name" required>
                <Input value={editing.form.name} autoFocus onChange={(_, d) => set({ name: d.value })} />
              </Field>
              <Switch label="On" checked={editing.form.isActive} onChange={(_, d) => set({ isActive: d.checked })} />
            </div>
            <Text weight="semibold">Applies to enquiries with…</Text>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Folder">
                <Dropdown
                  value={lookups.folderName(editing.form.appliesTo.folderId) ?? 'Any'}
                  selectedOptions={[editing.form.appliesTo.folderId ?? '']}
                  onOptionSelect={(_, d) => setApplies({ folderId: d.optionValue || null })}
                >
                  <Option value="">Any</Option>
                  {lookups.folders.map((f) => (
                    <Option key={f.id} value={f.id}>
                      {f.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Category">
                <Dropdown
                  value={
                    editing.form.appliesTo.categoryId ? lookups.categoryName(editing.form.appliesTo.categoryId) : 'Any'
                  }
                  selectedOptions={[editing.form.appliesTo.categoryId ?? '']}
                  onOptionSelect={(_, d) => setApplies({ categoryId: d.optionValue || null })}
                >
                  <Option value="">Any</Option>
                  {lookups.categories.map((c) => (
                    <Option key={c.id} value={c.id}>
                      {c.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Priority">
                <Dropdown
                  value={editing.form.appliesTo.priority ? PRIORITY_LABELS[editing.form.appliesTo.priority] : 'Any'}
                  selectedOptions={[editing.form.appliesTo.priority ?? '']}
                  onOptionSelect={(_, d) => setApplies({ priority: (d.optionValue as TicketPriority) || null })}
                >
                  <Option value="">Any</Option>
                  {TICKET_PRIORITIES.map((p) => (
                    <Option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {minutesField('Reply within', 'firstResponseMins', 'Time to the first reply.')}
              {minutesField('Resolve within', 'resolutionMins', 'Counted from when the enquiry arrived.')}
            </div>
            <Text weight="semibold">Working hours</Text>
            <div className="flex flex-wrap gap-x-3">
              {DAYS.map((label, i) => (
                <Checkbox
                  key={label}
                  label={label}
                  checked={editing.form.businessHours.days.includes(i + 1)}
                  onChange={(_, d) =>
                    setHours({
                      days: d.checked
                        ? [...editing.form.businessHours.days, i + 1].sort()
                        : editing.form.businessHours.days.filter((x) => x !== i + 1),
                    })
                  }
                />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Opens">
                <Input
                  type="time"
                  value={editing.form.businessHours.start}
                  onChange={(_, d) => setHours({ start: d.value })}
                />
              </Field>
              <Field label="Closes">
                <Input
                  type="time"
                  value={editing.form.businessHours.end}
                  onChange={(_, d) => setHours({ end: d.value })}
                />
              </Field>
              <Field label="Time zone">
                <Input value={editing.form.businessHours.tz} onChange={(_, d) => setHours({ tz: d.value })} />
              </Field>
            </div>
            <Field label="Supervisor to alert when overdue">
              <Dropdown
                value={lookups.officerName(editing.form.escalateToUserId) ?? 'Nobody'}
                selectedOptions={[editing.form.escalateToUserId ?? '']}
                onOptionSelect={(_, d) => set({ escalateToUserId: d.optionValue || null })}
              >
                <Option value="">Nobody</Option>
                {lookups.officers
                  .filter((o) => o.role !== 'agent')
                  .map((o) => (
                    <Option key={o.id} value={o.id}>
                      {o.displayName}
                    </Option>
                  ))}
              </Dropdown>
            </Field>
          </fieldset>
        )}
      </EditDialog>

      <ConfirmDelete
        what={deleting && `the SLA policy “${deleting.name}”`}
        consequence="Open enquiries using it move to the next matching policy straight away."
        onClose={() => setDeleting(null)}
        onConfirm={() => write.mutateAsync(() => api.admin.slaPolicies.remove(deleting!.id)).then(() => undefined)}
      />
    </>
  );
}
