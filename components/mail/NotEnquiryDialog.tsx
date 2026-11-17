'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  Textarea,
  tokens,
} from '@fluentui/react-components';
import { NOT_ENQUIRY_LABELS, NOT_ENQUIRY_REASONS, type NotEnquiryReason } from '@/lib/shared';
import { api } from '@/lib/api';
import { useNotify } from '@/lib/notify';
import { queryKeys } from './MailboxContext';

interface NotEnquiryDialogProps {
  /** The enquiries to set aside (one, or the list selection). */
  ids: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/**
 * Marks emails "Not an enquiry" (adverts, mail we were only copied on). Nothing is sent; they move
 * to Not enquiries, where supervisors and admins see the reason and can restore them.
 */
export function NotEnquiryDialog({ ids, open, onOpenChange, onDone }: NotEnquiryDialogProps) {
  const client = useQueryClient();
  const notify = useNotify();
  const [reason, setReason] = useState<NotEnquiryReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(null);
      setNote('');
      setError(null);
    }
  }, [open]);

  const needsNote = reason === 'other' && !note.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason || needsNote) return;
    setSaving(true);
    setError(null);
    try {
      const body = { reason, note: note.trim() };
      if (ids.length === 1) {
        await api.markNotEnquiry(ids[0]!, body);
      } else {
        const result = await api.bulkNotEnquiry(ids, body);
        if (result.failed.length) {
          notify(`${result.failed.length} of ${ids.length} weren’t moved`, result.failed[0]!.error);
        }
      }
      notify(
        ids.length === 1 ? 'Moved to Not enquiries' : `${ids.length} moved to Not enquiries`,
        undefined,
        'success',
      );
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
      void client.invalidateQueries({ queryKey: ['tickets'] });
      void client.invalidateQueries({ queryKey: ['ticket'] });
      void client.invalidateQueries({ queryKey: queryKeys.counts });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !saving && onOpenChange(d.open)}>
      <DialogSurface aria-describedby={undefined} style={{ maxWidth: 480 }}>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <DialogBody>
            <DialogTitle>Not an enquiry{ids.length > 1 ? ` (${ids.length})` : ''}</DialogTitle>
            <DialogContent className="flex flex-col gap-3">
              {error && (
                <MessageBar intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
              <Field label="Why isn’t this an enquiry?" required>
                <RadioGroup value={reason ?? ''} onChange={(_, d) => setReason(d.value as NotEnquiryReason)}>
                  {NOT_ENQUIRY_REASONS.map((r) => (
                    <Radio key={r} value={r} label={NOT_ENQUIRY_LABELS[r]} />
                  ))}
                </RadioGroup>
              </Field>
              <Field
                label="Note"
                required={reason === 'other'}
                validationMessage={needsNote ? 'Say why it isn’t an enquiry' : undefined}
              >
                <Textarea
                  value={note}
                  onChange={(_, d) => setNote(d.value)}
                  rows={3}
                  maxLength={500}
                  resize="vertical"
                />
              </Field>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                No email is sent. It moves to Not enquiries, where a supervisor can review it. If the sender writes
                again, it comes back as an enquiry.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                type="submit"
                disabled={saving || !reason || needsNote}
                icon={saving ? <Spinner size="tiny" /> : undefined}
              >
                Move to Not enquiries
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}
