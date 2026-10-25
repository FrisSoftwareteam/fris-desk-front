'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  mergeClasses,
  Option,
  Radio,
  RadioGroup,
  SpinButton,
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
  type SettingsDto,
  type TicketPriority,
} from '@/lib/shared';
import { api } from '@/lib/api';
import { friendlyError, SectionHeader, useAdminStyles, useAdminWrite } from './common';

/** Labels and explanations for Settings → Assignment method (also shown in the rule editor). */
export const ASSIGNMENT_METHODS: Record<AssignmentMode, { label: string; hint: string }> = {
  round_robin: {
    label: 'Round-robin',
    hint: 'Officers in a rule’s pool take turns, whatever their current workload.',
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

/** Admin → Settings: auto-acknowledgement, round-robin, default priority, external-sender tag text, retention. */
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
            Assignment
          </Text>
          <Switch
            label="Assign new enquiries automatically from rules’ officer pools"
            checked={form.roundRobinEnabled}
            onChange={(_, d) => setForm({ ...form, roundRobinEnabled: d.checked })}
          />
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
    </>
  );
}
