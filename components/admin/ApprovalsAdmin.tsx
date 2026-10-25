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
  Spinner,
  Switch,
  Text,
} from '@fluentui/react-components';
import type { ApprovalPolicyDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { friendlyError, SectionHeader, useAdminStyles, useAdminWrite, useLookups } from './common';

/** One multi-select of ids, showing the chosen names. */
function PickMany({
  label,
  hint,
  placeholder,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  options: { id: string; name: string }[];
  value: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const name = (id: string) => options.find((o) => o.id === id)?.name ?? 'Removed';
  return (
    <Field label={label} hint={hint}>
      <Dropdown
        multiselect
        disabled={disabled}
        placeholder={placeholder}
        value={value.map(name).join(', ')}
        selectedOptions={value}
        onOptionSelect={(_, d) => onChange(d.selectedOptions)}
      >
        {options.map((o) => (
          <Option key={o.id} value={o.id}>
            {o.name}
          </Option>
        ))}
      </Dropdown>
    </Field>
  );
}

/**
 * Admin → Approvals: which agents' replies a supervisor must approve before they're sent.
 * Supervisors and admins both manage it.
 */
export function ApprovalsAdmin() {
  const styles = useAdminStyles();
  const policy = useQuery({ queryKey: ['approval-policy'], queryFn: api.approvalPolicy });
  const templates = useQuery({ queryKey: ['templates', 'all'], queryFn: () => api.templates(null) });
  const { officers, categories } = useLookups();
  const write = useAdminWrite(['approval-policy']);
  const [form, setForm] = useState<ApprovalPolicyDto | null>(null);
  const [status, setStatus] = useState<{ intent: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (policy.data && !form) setForm(policy.data);
  }, [policy.data, form]);

  if (policy.error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{policy.error.message}</MessageBarBody>
      </MessageBar>
    );
  }
  if (!form) return <Spinner size="small" className="p-6" />;

  const set = (patch: Partial<ApprovalPolicyDto>) => setForm({ ...form, ...patch });
  const off = !form.enabled;
  const nothingChosen =
    form.enabled &&
    !form.allAgentReplies &&
    !form.userIds.length &&
    !form.categoryIds.length &&
    !form.templateIds.length;

  const save = () => {
    setStatus(null);
    write.mutate(() => api.patchApprovalPolicy(form), {
      onSuccess: (saved) => {
        setForm(saved as ApprovalPolicyDto);
        setStatus({ intent: 'success', text: 'Approval settings saved.' });
      },
      onError: (err) => setStatus({ intent: 'error', text: friendlyError(err) }),
    });
  };

  return (
    <>
      <SectionHeader
        title="Approvals"
        description="Hold some agents’ replies until a supervisor approves them. Held replies appear under “Awaiting approval”, and supervisors are notified. Supervisors’ and admins’ own replies, and internal notes, are never held."
      />
      <div className={mergeClasses(styles.card, styles.padded, 'flex max-w-3xl flex-col gap-5')}>
        <Switch
          label="Require supervisor approval for some replies"
          checked={form.enabled}
          onChange={(_, d) => set({ enabled: d.checked })}
        />
        <Switch
          disabled={off}
          label="Every reply from an agent"
          checked={form.allAgentReplies}
          onChange={(_, d) => set({ allAgentReplies: d.checked })}
        />
        <Text size={200} className={styles.muted}>
          {form.allAgentReplies
            ? 'All agent replies are held, so the choices below make no difference.'
            : 'Or only replies that match any of these:'}
        </Text>
        <PickMany
          label="By these officers"
          hint="For example, new staff still in training."
          placeholder="Choose agents"
          disabled={off || form.allAgentReplies}
          options={officers.filter((o) => o.role === 'agent').map((o) => ({ id: o.id, name: o.displayName }))}
          value={form.userIds}
          onChange={(userIds) => set({ userIds })}
        />
        <PickMany
          label="On enquiries in these categories"
          hint="For example, complaints or transmission (probate) cases."
          placeholder="Choose categories"
          disabled={off || form.allAgentReplies}
          options={categories.map((c) => ({ id: c.id, name: c.name }))}
          value={form.categoryIds}
          onChange={(categoryIds) => set({ categoryIds })}
        />
        <PickMany
          label="Using these templates"
          hint="Held when the agent inserted one of these canned responses."
          placeholder="Choose templates"
          disabled={off || form.allAgentReplies}
          options={(templates.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
          value={form.templateIds}
          onChange={(templateIds) => set({ templateIds })}
        />
        <Switch
          disabled={off}
          label="Apply the same rules to forwards"
          checked={form.includeForwards}
          onChange={(_, d) => set({ includeForwards: d.checked })}
        />
        {nothingChosen && (
          <MessageBar intent="warning">
            <MessageBarBody>Approval is on, but no rule is chosen yet, so nothing will be held.</MessageBarBody>
          </MessageBar>
        )}
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
            Save approval settings
          </Button>
        </div>
      </div>
    </>
  );
}
