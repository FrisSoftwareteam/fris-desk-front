'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  makeStyles,
  mergeClasses,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
  tokens,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { api } from '@/lib/api';
import type { AssignmentRuleDto } from '@/lib/shared';

// Tables set a minWidth; on a phone they scroll sideways inside their card rather than squeezing
// columns together.

// Building blocks shared by the Admin screens: section heading, list card, edit dialog, delete
// confirmation, and the lookups most screens need.

export const useAdminStyles = makeStyles({
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  title: {
    margin: 0,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
    overflowX: 'auto',
  },
  padded: { padding: tokens.spacingHorizontalL },
  rowActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalXS,
  },
  inactive: { color: tokens.colorNeutralForegroundDisabled },
  empty: { display: 'block', padding: tokens.spacingHorizontalXXL },
});

export function SectionHeader({
  title,
  description,
  addLabel,
  onAdd,
}: {
  title: string;
  description: ReactNode;
  addLabel?: string;
  onAdd?: () => void;
}) {
  const styles = useAdminStyles();
  return (
    <div className={styles.header}>
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 className={styles.title}>{title}</h2>
        <Text size={300} className={styles.muted}>
          {description}
        </Text>
      </div>
      {onAdd && (
        <Button appearance="primary" icon={<AddRegular />} onClick={onAdd}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}

/** Loading / error / empty states around a list. */
export function ListState({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; error: Error | null };
  empty: boolean;
  children: ReactNode;
}) {
  const styles = useAdminStyles();
  if (query.isPending) return <Spinner size="small" className="p-6" />;
  if (query.error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{query.error.message}</MessageBarBody>
      </MessageBar>
    );
  }
  if (empty) {
    return (
      <div className={styles.card}>
        <Text className={mergeClasses(styles.muted, styles.empty)}>Nothing here yet.</Text>
      </div>
    );
  }
  return <div className={styles.card}>{children}</div>;
}

/**
 * A form in a dialog. `onSave` throws to show an error; resolving closes the dialog.
 */
export function EditDialog({
  open,
  title,
  onClose,
  onSave,
  children,
  wide,
  saveLabel = 'Save',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  children: ReactNode;
  wide?: boolean;
  saveLabel?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave();
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open && !saving) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogSurface aria-describedby={undefined} style={{ maxWidth: wide ? 820 : 560 }}>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <DialogBody>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent className="flex flex-col gap-3">
              {error && (
                <MessageBar intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
              {children}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" type="button" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                type="submit"
                disabled={saving}
                icon={saving ? <Spinner size="tiny" /> : undefined}
              >
                {saveLabel}
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}

/** Fluent confirmation in place of the browser's confirm() box. */
export function ConfirmDelete({
  what,
  consequence,
  onConfirm,
  onClose,
}: {
  /** e.g. 'the folder "Dividend"'; null keeps the dialog closed. */
  what: string | null;
  consequence?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <EditDialog open={what !== null} title="Delete?" onClose={onClose} onSave={onConfirm} saveLabel="Delete">
      <Text>
        Delete {what}? {consequence}
      </Text>
    </EditDialog>
  );
}

/** Turns a Zod 400 from the API into the first readable message. */
export function friendlyError(err: unknown): string {
  return (err as Error).message === 'Invalid request'
    ? 'Check the highlighted values and try again.'
    : (err as Error).message;
}

/** Runs an admin write and refreshes the given lists (and the mail screen's copies). */
export function useAdminWrite(...keys: QueryKey[]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (write: () => Promise<unknown>) => write(),
    onSuccess: () => keys.forEach((queryKey) => void client.invalidateQueries({ queryKey })),
  });
}

/** Reference lists most admin screens show names from. */
export function useLookups() {
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders, staleTime: 60_000 });
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 60_000 });
  const users = useQuery({ queryKey: ['users'], queryFn: api.users, staleTime: 60_000 });
  return {
    folders: folders.data ?? [],
    categories: categories.data ?? [],
    officers: users.data ?? [],
    folderName: (id: string | null) => (id ? (folders.data?.find((f) => f.id === id)?.name ?? 'Deleted folder') : null),
    categoryName: (id: string) => categories.data?.find((c) => c.id === id)?.name ?? 'Deleted category',
    officerName: (id: string | null) =>
      id ? (users.data?.find((u) => u.id === id)?.displayName ?? 'Inactive officer') : null,
  };
}

/** Officers named by an active "assign to one officer" rule (id → rule name); pools skip them. */
export function reservedOfficers(rules: AssignmentRuleDto[], exceptRuleId: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rules) {
    if (r.id === exceptRuleId || !r.isActive || r.action.assignStrategy !== 'specific' || !r.action.assigneeId)
      continue;
    if (!out.has(r.action.assigneeId)) out.set(r.action.assigneeId, r.name);
  }
  return out;
}

/**
 * Multi-select of officers for a pool. Officers reserved by a one-officer rule can't be added (one
 * already in the pool stays selectable, so it can be removed).
 */
export function OfficerPoolPicker({
  value,
  onChange,
  reserved,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  reserved: Map<string, string>;
  disabled?: boolean;
}) {
  const lookups = useLookups();
  return (
    <Dropdown
      multiselect
      disabled={disabled}
      placeholder="Choose officers"
      value={value.map((id) => lookups.officerName(id)).join(', ')}
      selectedOptions={value}
      onOptionSelect={(_, d) => onChange(d.selectedOptions)}
    >
      {lookups.officers.map((o) => {
        const by = reserved.get(o.id);
        const text = by ? `${o.displayName} · assigned by “${by}”` : o.displayName;
        return (
          <Option key={o.id} value={o.id} text={text} disabled={!!by && !value.includes(o.id)}>
            {text}
          </Option>
        );
      })}
    </Dropdown>
  );
}
