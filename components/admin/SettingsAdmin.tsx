'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  mergeClasses,
  Option,
  Radio,
  RadioGroup,
  SpinButton,
  ProgressBar,
  Spinner,
  Switch,
  Text,
  Textarea,
} from '@fluentui/react-components';
import {
  ASSIGNMENT_MODES,
  DELETE_RESOLVED_OPTIONS,
  PRIORITY_LABELS,
  PURGE_DELETED_OPTIONS,
  TICKET_PRIORITIES,
  type AssignmentMode,
  type JobProgressDto,
  type SettingsDto,
  type TicketPriority,
} from '@/lib/shared';
import { api } from '@/lib/api';
import { EditDialog, friendlyError, OfficerPoolPicker, SectionHeader, useAdminStyles, useAdminWrite } from './common';

/** Labels and explanations for Settings → Assignment method (also shown in the rule editor). */
export const ASSIGNMENT_METHODS: Record<AssignmentMode, { label: string; hint: string }> = {
  round_robin: {
    label: 'Round-robin',
    hint: 'Officers in the pool take turns, whatever their current workload.',
  },
  least_loaded: {
    label: 'Least workload',
    hint: 'The officer with the fewest open enquiries gets the next one. Equally busy officers take turns.',
  },
  capped_round_robin: {
    label: 'Round-robin with a workload limit',
    hint: 'Officers take turns, but anyone at the limit is skipped until they close some. If everyone is at the limit, the least busy officer gets it.',
  },
};

/** "30 days", "1 year", "7 years". */
function daysLabel(days: number | null, none = ''): string {
  if (!days) return none;
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  return `${days} days`;
}

/** Admin → Settings: auto-acknowledgement, resolution email, round-robin, default priority, external-sender tag text, retention. */
export function SettingsAdmin() {
  const styles = useAdminStyles();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.admin.settings });
  const templates = useQuery({ queryKey: ['templates', 'all'], queryFn: () => api.templates(null) });
  const mailbox = useQuery({ queryKey: ['mailbox'], queryFn: api.mailbox });
  const write = useAdminWrite(['settings']);
  const [form, setForm] = useState<SettingsDto | null>(null);
  const [phrases, setPhrases] = useState('');
  const [status, setStatus] = useState<{ intent: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (settings.data && !form) {
      setForm(settings.data);
      setPhrases(settings.data.externalSenderPhrases.join('\n'));
    }
  }, [settings.data, form]);

  if (settings.isPending || !form) return <Spinner size="small" className="p-6" />;
  if (settings.error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{settings.error.message}</MessageBarBody>
      </MessageBar>
    );
  }

  const save = () => {
    setStatus(null);
    const body: SettingsDto = {
      ...form,
      externalSenderPhrases: phrases
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
    };
    if (body.autoAcknowledge.enabled && !body.autoAcknowledge.templateId) {
      setStatus({ intent: 'error', text: 'Choose the template to send before turning on auto-acknowledgement.' });
      return;
    }
    if (body.resolutionEmail.enabled && !body.resolutionEmail.templateId) {
      setStatus({ intent: 'error', text: 'Choose the template to send before turning on the resolution email.' });
      return;
    }
    if (body.autoResolveEmail.enabled && !body.autoResolveEmail.templateId) {
      setStatus({ intent: 'error', text: 'Choose the template to send before turning on the auto-resolve email.' });
      return;
    }
    if (body.roundRobinEnabled && body.defaultPool.length === 0) {
      setStatus({
        intent: 'error',
        text: 'Choose the officers who get new enquiries before turning on automatic assignment.',
      });
      return;
    }
    write.mutate(() => api.admin.patchSettings(body), {
      onSuccess: (saved) => {
        const s = saved as SettingsDto;
        setForm(s);
        setPhrases(s.externalSenderPhrases.join('\n'));
        setStatus({ intent: 'success', text: 'Settings saved.' });
      },
      onError: (err) => setStatus({ intent: 'error', text: friendlyError(err) }),
    });
  };

  const templateName = templates.data?.find((t) => t.id === form.autoAcknowledge.templateId)?.name;
  const resolutionTemplateName = templates.data?.find((t) => t.id === form.resolutionEmail.templateId)?.name;
  const autoResolveTemplateName = templates.data?.find((t) => t.id === form.autoResolveEmail.templateId)?.name;
  const allowlist = mailbox.data?.sendAllowlist;

  return (
    <>
      <SectionHeader
        title="Settings"
        description="How Registrar Desk behaves for everyone. Changes take effect within a minute."
      />
      <div className={mergeClasses(styles.card, styles.padded, 'flex max-w-3xl flex-col gap-6')}>
        <section className="flex flex-col gap-3">
          <Text weight="semibold" size={400}>
            Auto-acknowledgement
          </Text>
          <Switch
            label="Email new shareholders an acknowledgement with their reference number"
            checked={form.autoAcknowledge.enabled}
            onChange={(_, d) => setForm({ ...form, autoAcknowledge: { ...form.autoAcknowledge, enabled: d.checked } })}
          />
          <Field label="Template to send" hint="Automated and no-reply senders are skipped.">
            <Dropdown
              placeholder="Choose a template"
              value={templateName ?? ''}
              selectedOptions={form.autoAcknowledge.templateId ? [form.autoAcknowledge.templateId] : []}
              onOptionSelect={(_, d) =>
                setForm({ ...form, autoAcknowledge: { ...form.autoAcknowledge, templateId: d.optionValue ?? null } })
              }
            >
              {(templates.data ?? []).map((t) => (
                <Option key={t.id} value={t.id}>
                  {t.name}
                </Option>
              ))}
            </Dropdown>
          </Field>
          {allowlist && (
            <Text size={200} className={styles.muted}>
              Test mode: this server only sends email to {allowlist.join(', ')}.
            </Text>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <Text weight="semibold" size={400}>
            Resolution email
          </Text>
          <Switch
            label="Email the shareholder when their enquiry is resolved, asking them to confirm they're satisfied"
            checked={form.resolutionEmail.enabled}
            onChange={(_, d) => setForm({ ...form, resolutionEmail: { ...form.resolutionEmail, enabled: d.checked } })}
          />
          <Field
            label="Template to send"
            hint="Supervisors and admins can edit the wording under Templates. A reply from the shareholder reopens the enquiry."
          >
            <Dropdown
              placeholder="Choose a template"
              value={resolutionTemplateName ?? ''}
              selectedOptions={form.resolutionEmail.templateId ? [form.resolutionEmail.templateId] : []}
              onOptionSelect={(_, d) =>
                setForm({ ...form, resolutionEmail: { ...form.resolutionEmail, templateId: d.optionValue ?? null } })
              }
            >
              {(templates.data ?? []).map((t) => (
                <Option key={t.id} value={t.id}>
                  {t.name}
                </Option>
              ))}
            </Dropdown>
          </Field>
        </section>

        <section className="flex flex-col gap-3">
          <Text weight="semibold" size={400}>
            Auto-resolve email
          </Text>
          <Switch
            label="Email the shareholder when an enquiry resolves itself because they didn't reply in time"
            checked={form.autoResolveEmail.enabled}
            onChange={(_, d) =>
              setForm({ ...form, autoResolveEmail: { ...form.autoResolveEmail, enabled: d.checked } })
            }
          />
          <Field
            label="Template to send"
            hint="For example: “We haven't heard back, so we've closed this enquiry. Just reply to this email to continue.” A reply reopens the enquiry."
          >
            <Dropdown
              placeholder="Choose a template"
              value={autoResolveTemplateName ?? ''}
              selectedOptions={form.autoResolveEmail.templateId ? [form.autoResolveEmail.templateId] : []}
              onOptionSelect={(_, d) =>
                setForm({ ...form, autoResolveEmail: { ...form.autoResolveEmail, templateId: d.optionValue ?? null } })
              }
            >
              {(templates.data ?? []).map((t) => (
                <Option key={t.id} value={t.id}>
                  {t.name}
                </Option>
              ))}
            </Dropdown>
          </Field>
        </section>

        <section className="flex flex-col gap-3">
          <Text weight="semibold" size={400}>
            Shared mailbox
          </Text>
          <Switch
            label="Mark an enquiry's emails as read in the shared mailbox when it's resolved"
            checked={form.markReadOnResolve}
            onChange={(_, d) => setForm({ ...form, markReadOnResolve: d.checked })}
          />
        </section>

        <section className="flex flex-col gap-3">
          <Text weight="semibold" size={400}>
            Assignment
          </Text>
          <Switch
            label="Assign new enquiries automatically"
            checked={form.roundRobinEnabled}
            onChange={(_, d) => setForm({ ...form, roundRobinEnabled: d.checked })}
          />
          <Field
            label="Officers"
            required={form.roundRobinEnabled}
            validationState={form.roundRobinEnabled && form.defaultPool.length === 0 ? 'error' : 'none'}
            validationMessage={
              form.roundRobinEnabled && form.defaultPool.length === 0
                ? 'Choose who gets new enquiries, or switch automatic assignment off.'
                : undefined
            }
            hint="New email enquiries that no rule assigns go to these officers, using the method below. Rules with their own officer pool use that pool instead."
          >
            <OfficerPoolPicker
              value={form.defaultPool}
              onChange={(ids) => setForm({ ...form, defaultPool: ids })}
              disabled={!form.roundRobinEnabled}
            />
          </Field>
          <Field
            label="Assignment method"
            hint={`${ASSIGNMENT_METHODS[form.assignmentMode].hint} Open means assigned, in progress, awaiting the shareholder or escalated.`}
          >
            <Dropdown
              disabled={!form.roundRobinEnabled}
              value={ASSIGNMENT_METHODS[form.assignmentMode].label}
              selectedOptions={[form.assignmentMode]}
              onOptionSelect={(_, d) => setForm({ ...form, assignmentMode: d.optionValue as AssignmentMode })}
            >
              {ASSIGNMENT_MODES.map((m) => (
                <Option key={m} value={m}>
                  {ASSIGNMENT_METHODS[m].label}
                </Option>
              ))}
            </Dropdown>
          </Field>
          {form.assignmentMode === 'capped_round_robin' && (
            <Field label="Workload limit" hint="Open enquiries per officer (1–200).">
              <SpinButton
                className="max-w-40"
                disabled={!form.roundRobinEnabled}
                value={form.workloadCap}
                min={1}
                max={200}
                onChange={(_, d) => {
                  const cap = d.value ?? Number(d.displayValue);
                  if (Number.isInteger(cap) && cap! >= 1 && cap! <= 200) setForm({ ...form, workloadCap: cap! });
                }}
              />
            </Field>
          )}
          <Field label="Priority of new email enquiries">
            <RadioGroup
              layout="horizontal"
              value={form.defaultPriority}
              onChange={(_, d) => setForm({ ...form, defaultPriority: d.value as TicketPriority })}
            >
              {TICKET_PRIORITIES.map((p) => (
                <Radio key={p} value={p} label={PRIORITY_LABELS[p]} />
              ))}
            </RadioGroup>
          </Field>
        </section>

        <section className="flex flex-col gap-3">
          <Text weight="semibold" size={400}>
            External-sender tag text
          </Text>
          <Field
            label="Hide these notices from list previews"
            hint="One per line: the opening words of a warning your mail system adds to outside email. The rest of that line is hidden too. Common Exchange notices are already hidden. Applies to email that arrives from now on."
          >
            <Textarea
              value={phrases}
              rows={4}
              resize="vertical"
              placeholder="e.g. CAUTION: This email originated from outside"
              onChange={(_, d) => setPhrases(d.value)}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-3">
          <Text weight="semibold" size={400}>
            Retention
          </Text>
          <Text size={200} className={styles.muted}>
            Supervisors and admins can delete enquiries; they go to Deleted items, where they can be restored. Permanent
            deletion removes Registrar Desk&apos;s copy (messages, notes, attachment copies and history) and can&apos;t
            be undone. Emails in the shared mailbox are never touched. Both rules run nightly at 03:00.
          </Text>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Permanently delete enquiries in Deleted items after">
              <Dropdown
                value={daysLabel(form.retention.purgeDeletedAfterDays, 'Never')}
                selectedOptions={[String(form.retention.purgeDeletedAfterDays ?? '')]}
                onOptionSelect={(_, d) =>
                  setForm({
                    ...form,
                    retention: {
                      ...form.retention,
                      purgeDeletedAfterDays: d.optionValue ? Number(d.optionValue) : null,
                    },
                  })
                }
              >
                <Option value="">Never</Option>
                {PURGE_DELETED_OPTIONS.map((n) => (
                  <Option key={n} value={String(n)}>
                    {daysLabel(n)}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Move resolved enquiries to Deleted items after">
              <Dropdown
                value={daysLabel(form.retention.deleteResolvedAfterDays, 'Never')}
                selectedOptions={[String(form.retention.deleteResolvedAfterDays ?? '')]}
                onOptionSelect={(_, d) =>
                  setForm({
                    ...form,
                    retention: {
                      ...form.retention,
                      deleteResolvedAfterDays: d.optionValue ? Number(d.optionValue) : null,
                    },
                  })
                }
              >
                <Option value="">Never</Option>
                {DELETE_RESOLVED_OPTIONS.map((n) => (
                  <Option key={n} value={String(n)}>
                    {`${daysLabel(n)} without activity`}
                  </Option>
                ))}
              </Dropdown>
            </Field>
          </div>
          {form.retention.purgeDeletedAfterDays !== settings.data?.retention.purgeDeletedAfterDays &&
            form.retention.purgeDeletedAfterDays !== null && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  After saving, enquiries already in Deleted items for longer than{' '}
                  {daysLabel(form.retention.purgeDeletedAfterDays)} are permanently deleted at the next nightly run.
                </MessageBarBody>
              </MessageBar>
            )}
        </section>

        {status && (
          <MessageBar intent={status.intent}>
            <MessageBarBody>{status.text}</MessageBarBody>
          </MessageBar>
        )}
        <div>
          <Button
            appearance="primary"
            onClick={save}
            disabled={write.isPending}
            icon={write.isPending ? <Spinner size="tiny" /> : undefined}
          >
            Save settings
          </Button>
        </div>
      </div>
      {settings.data && <AssignBacklogCard saved={settings.data} />}
      <OutlookMatchCard />
      <OutlookSentCard />
      <ClearDataCard />
    </>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Shares out open enquiries nobody owns (e.g. those already waiting at go-live) with the saved
 * assignment settings: routing rules first, then the default pool, using the chosen method.
 */
function AssignBacklogCard({ saved }: { saved: SettingsDto }) {
  const styles = useAdminStyles();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ assigned: number; skipped: number; remaining: number } | null>(null);
  const backlog = useQuery({ queryKey: ['unassigned-backlog'], queryFn: api.admin.unassignedBacklog });
  const count = backlog.data?.count ?? 0;
  const ready = saved.roundRobinEnabled && saved.defaultPool.length > 0;
  const method = ASSIGNMENT_METHODS[saved.assignmentMode].label.toLowerCase();

  const apply = async () => {
    setError(null);
    try {
      setResult(await api.admin.assignBacklog());
      // Counts, lists and officer workloads all change.
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(friendlyError(err));
    }
    setConfirming(false);
  };

  return (
    <div className={mergeClasses(styles.card, styles.padded, 'mt-4 flex max-w-3xl flex-col gap-3')}>
      <Text weight="semibold" size={400}>
        Assign unassigned enquiries
      </Text>
      <Text size={200} className={styles.muted}>
        Open enquiries that nobody owns are shared out the way new email is: routing rules first, then the default
        officers, using {method}. Use this once officers are set up, for example at go-live. Folders and categories are
        not changed and no email is sent.
      </Text>
      {!ready && (
        <MessageBar intent="warning">
          <MessageBarBody>Turn on automatic assignment and choose the officers above, then save.</MessageBarBody>
        </MessageBar>
      )}
      {backlog.data && (
        <MessageBar intent={count ? 'info' : 'success'}>
          <MessageBarBody>
            {count
              ? `${plural(count, 'open enquiry', 'open enquiries')} unassigned.`
              : 'Every open enquiry is assigned.'}
          </MessageBarBody>
        </MessageBar>
      )}
      {result && (
        <Text size={200} className={styles.muted}>
          {plural(result.assigned, 'enquiry', 'enquiries')} assigned
          {result.skipped ? `, ${result.skipped} left unassigned (no officer available)` : ''}
          {result.remaining > result.skipped ? `. ${result.remaining - result.skipped} more to do: click again.` : '.'}
        </Text>
      )}
      {(error || backlog.error) && (
        <MessageBar intent="error">
          <MessageBarBody>{error ?? friendlyError(backlog.error)}</MessageBarBody>
        </MessageBar>
      )}
      <div className="flex gap-2">
        <Button appearance="primary" onClick={() => setConfirming(true)} disabled={!ready || !count}>
          Assign now
        </Button>
      </div>
      <EditDialog
        open={confirming}
        title="Assign unassigned enquiries?"
        onClose={() => setConfirming(false)}
        onSave={apply}
        saveLabel="Assign"
      >
        <Text>
          {`Up to 200 of the ${plural(count, 'unassigned open enquiry', 'unassigned open enquiries')} will be assigned using ${method}, oldest first. Each assignment appears in the enquiry's history.`}
        </Text>
      </EditDialog>
    </div>
  );
}

/**
 * One-off switchover from Outlook: officers used unread Inbox mail as their to-do list, so this
 * makes the app's active enquiries match it. Shows what would change before anything happens.
 */
function OutlookMatchCard() {
  const styles = useAdminStyles();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const match = useQuery({
    queryKey: ['outlook-match'],
    queryFn: api.admin.outlookMatch,
    enabled: false,
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });
  const data = match.data;
  const nothingToDo = data && !data.toResolve && !data.toReopen && !data.toImport;
  const last = data?.lastResult;

  const apply = async () => {
    setError(null);
    try {
      await api.admin.startOutlookMatch();
      setConfirming(false);
      await match.refetch();
    } catch (err) {
      setError(friendlyError(err));
      setConfirming(false);
    }
  };

  return (
    <div className={mergeClasses(styles.card, styles.padded, 'mt-4 flex max-w-3xl flex-col gap-3')}>
      <Text weight="semibold" size={400}>
        Match Outlook unread mail
      </Text>
      <Text size={200} className={styles.muted}>
        For switching over from Outlook. Enquiries whose emails are all read in the shared Inbox are resolved; enquiries
        with unread mail stay open (resolved ones are reopened); unread mail the app hasn&apos;t imported yet is
        imported without sending an acknowledgement. Outlook itself is not changed.
      </Text>
      {data?.running && (
        <MessageBar intent="info">
          <MessageBarBody>
            <Spinner size="tiny" className="mr-2 inline-flex" />
            <ProgressLine progress={data.progress} fallback="Matching… this can take a few minutes." />
          </MessageBarBody>
        </MessageBar>
      )}
      {data && !data.running && (
        <MessageBar intent={nothingToDo ? 'success' : 'warning'}>
          <MessageBarBody>
            {nothingToDo
              ? 'The app already matches Outlook.'
              : `Outlook has ${data.unreadInOutlook} unread: ${data.unreadInOutlook - data.toImport} already in the app, ${data.toImport} to import. ${plural(data.toResolve, 'enquiry', 'enquiries')} will be resolved and ${data.toReopen} reopened.`}
          </MessageBarBody>
        </MessageBar>
      )}
      {last && !data?.running && (
        <Text size={200} className={styles.muted}>
          Last run {new Date(last.finishedAt).toLocaleString()}: {last.resolved} resolved, {last.reopened} reopened,{' '}
          {last.imported} imported{last.failed ? `, ${last.failed} failed (see the server log)` : ''}
          {last.error ? `. Stopped: ${last.error}` : '.'}
        </Text>
      )}
      {(error || match.error) && (
        <MessageBar intent="error">
          <MessageBarBody>{error ?? friendlyError(match.error)}</MessageBarBody>
        </MessageBar>
      )}
      <div className="flex gap-2">
        <Button
          onClick={() => void match.refetch()}
          disabled={match.isFetching || data?.running}
          icon={match.isFetching && !data?.running ? <Spinner size="tiny" /> : undefined}
        >
          Check
        </Button>
        <Button
          appearance="primary"
          onClick={() => setConfirming(true)}
          disabled={!data || data.running || nothingToDo || match.isFetching}
        >
          Apply
        </Button>
      </div>
      <EditDialog
        open={confirming}
        title="Match Outlook unread mail?"
        onClose={() => setConfirming(false)}
        onSave={apply}
        saveLabel="Apply"
      >
        <Text>
          {data &&
            `${plural(data.toResolve, 'enquiry', 'enquiries')} will be resolved, ${data.toReopen} reopened and ${plural(data.toImport, 'email')} imported. No email is sent to shareholders. Each change appears in the enquiry's history.`}
        </Text>
      </EditDialog>
    </div>
  );
}

/** "Importing unread mail: 12 of 40 (30%)" while a background job runs. */
function ProgressLine({ progress, fallback }: { progress: JobProgressDto | null; fallback: string }) {
  if (!progress) return <>{fallback}</>;
  if (!progress.total) return <>{progress.step}…</>;
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <>
      {progress.step}: {progress.done} of {progress.total} ({pct}%)
      <ProgressBar value={progress.done / progress.total} className="mt-2" />
    </>
  );
}

/** Copies replies officers already sent from Outlook into the enquiry threads, so nobody repeats them. */
function OutlookSentCard() {
  const styles = useAdminStyles();
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ['outlook-sent'],
    queryFn: api.admin.outlookSent,
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });
  const data = status.data;
  const last = data?.lastResult;

  const start = async () => {
    setError(null);
    try {
      await api.admin.startOutlookSent();
      await status.refetch();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div className={mergeClasses(styles.card, styles.padded, 'mt-4 flex max-w-3xl flex-col gap-3')}>
      <Text weight="semibold" size={400}>
        Import replies sent from Outlook
      </Text>
      <Text size={200} className={styles.muted}>
        Adds replies already sent to the shareholder from Outlook (Sent Items) to each enquiry&apos;s thread, so
        officers can see what was said. Nothing is sent and no status changes. Safe to run again: replies already in the
        app are skipped.
      </Text>
      {data?.running && (
        <MessageBar intent="info">
          <MessageBarBody>
            <Spinner size="tiny" className="mr-2 inline-flex" />
            <ProgressLine progress={data.progress} fallback="Importing… this can take a few minutes." />
          </MessageBarBody>
        </MessageBar>
      )}
      {last && !data?.running && (
        <Text size={200} className={styles.muted}>
          Last run {new Date(last.finishedAt).toLocaleString()}: {plural(last.imported, 'reply', 'replies')} added to{' '}
          {plural(last.enquiries, 'enquiry', 'enquiries')}
          {last.failed ? `, ${last.failed} failed (see the server log)` : ''}
          {last.error ? `. Stopped: ${last.error}` : '.'}
        </Text>
      )}
      {(error || status.error) && (
        <MessageBar intent="error">
          <MessageBarBody>{error ?? friendlyError(status.error)}</MessageBarBody>
        </MessageBar>
      )}
      <div className="flex gap-2">
        <Button appearance="primary" onClick={() => void start()} disabled={!data || data.running}>
          Import
        </Button>
      </div>
    </div>
  );
}

/** Wipes test data before go-live. The admin must type DELETE; nothing can bring the data back. */
function ClearDataCard() {
  const styles = useAdminStyles();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const clear = async () => {
    if (typed !== 'DELETE') throw new Error('Type DELETE to confirm.');
    setResult(await api.admin.clearData());
    await queryClient.invalidateQueries();
  };

  return (
    <div className={mergeClasses(styles.card, styles.padded, 'mt-4 flex max-w-3xl flex-col gap-3')}>
      <Text weight="semibold" size={400}>
        Clear all enquiry data
      </Text>
      <Text size={200} className={styles.muted}>
        Permanently deletes every enquiry, email, draft, attachment copy, notification, pending approval, shareholder
        record and the activity log, and restarts enquiry numbers. Users, folders, categories, rules, SLA policies,
        templates, departments and settings stay. Old mail is not imported again; the shared mailbox is not changed.
      </Text>
      {result && (
        <MessageBar intent="success">
          <MessageBarBody>
            Cleared {plural(result.tickets ?? 0, 'enquiry', 'enquiries')} and {plural(result.messages ?? 0, 'email')}.
          </MessageBarBody>
        </MessageBar>
      )}
      <div>
        <Button
          appearance="primary"
          style={{ backgroundColor: 'var(--colorStatusDangerBackground3)' }}
          onClick={() => {
            setTyped('');
            setConfirming(true);
          }}
        >
          Clear all enquiry data
        </Button>
      </div>
      <EditDialog
        open={confirming}
        title="Clear all enquiry data?"
        onClose={() => setConfirming(false)}
        onSave={clear}
        saveLabel="Delete everything"
      >
        <div className="flex flex-col gap-3">
          <Text>This cannot be undone. Type DELETE to confirm.</Text>
          <Field label="Confirmation">
            <Input value={typed} onChange={(_, d) => setTyped(d.value)} autoComplete="off" />
          </Field>
        </div>
      </EditDialog>
    </div>
  );
}
