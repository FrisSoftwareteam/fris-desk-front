'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  Textarea,
} from '@fluentui/react-components';
import {
  PRIORITY_LABELS,
  TICKET_PRIORITIES,
  type CreateEnquiryDto,
  type TicketPriority,
  type TicketSummaryDto,
} from '@/lib/shared';
import { api } from '@/lib/api';
import { CategorySwatch } from './CategoryPill';
import { useMailbox } from './MailboxContext';

// Client-side checks mirror the server's, so officers see problems before submitting.
const EnquirySchema = z.object({
  name: z.string().trim().min(1, "Enter the shareholder's name"),
  email: z.union([z.literal(''), z.email('Enter a valid email address, or leave it blank')]),
  phone: z.string().trim().max(40, 'Phone number is too long'),
  subject: z.string().trim().min(1, 'Enter a subject'),
  details: z.string().trim().min(1, 'Describe what the shareholder asked'),
});
type FieldErrors = Partial<Record<keyof z.infer<typeof EnquirySchema>, string>>;

const EMPTY = { name: '', email: '', phone: '', subject: '', details: '' };

interface NewEnquiryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticket: TicketSummaryDto) => void;
}

/** Logs a phone call or walk-in as an enquiry (BUILD_SPEC §6, "New Enquiry form"). */
export function NewEnquiryDialog({ open, onOpenChange, onCreated }: NewEnquiryDialogProps) {
  const { folders, categories } = useMailbox();
  const [origin, setOrigin] = useState<CreateEnquiryDto['origin']>('phone');
  const [fields, setFields] = useState(EMPTY);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [assignToMe, setAssignToMe] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY) => (_: unknown, d: { value: string }) => {
    setFields((f) => ({ ...f, [key]: d.value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const reset = () => {
    setOrigin('phone');
    setFields(EMPTY);
    setFolderId(null);
    setCategoryIds([]);
    setPriority('normal');
    setAssignToMe(true);
    setErrors({});
    setServerError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = EnquirySchema.safeParse(fields);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof FieldErrors] ??= issue.message;
      setErrors(next);
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      const v = parsed.data;
      const created = await api.createEnquiry({
        origin,
        contact: { name: v.name, ...(v.email && { email: v.email }), ...(v.phone && { phone: v.phone }) },
        subject: v.subject,
        details: v.details,
        folderId,
        categoryIds,
        priority,
        assignToMe,
      });
      reset();
      onCreated(created);
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const folderName = folders.find((f) => f.id === folderId)?.name;
  const categoryNames = categories.filter((c) => categoryIds.includes(c.id)).map((c) => c.name);

  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)}>
      <DialogSurface aria-describedby={undefined} style={{ maxWidth: 640 }}>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <DialogBody>
            <DialogTitle>New enquiry</DialogTitle>
            <DialogContent className="flex flex-col gap-3">
              {serverError && (
                <MessageBar intent="error">
                  <MessageBarBody>{serverError}</MessageBarBody>
                </MessageBar>
              )}

              <Field label="How did the shareholder contact us?">
                <RadioGroup
                  layout="horizontal"
                  value={origin}
                  onChange={(_, d) => setOrigin(d.value as CreateEnquiryDto['origin'])}
                >
                  <Radio value="phone" label="Phone call" />
                  <Radio value="walk_in" label="Walk-in" />
                </RadioGroup>
              </Field>

              <Field label="Shareholder's name" required validationMessage={errors.name}>
                <Input value={fields.name} onChange={set('name')} autoFocus />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" hint="Optional. Needed to reply by email." validationMessage={errors.email}>
                  <Input type="email" value={fields.email} onChange={set('email')} />
                </Field>
                <Field label="Phone" hint="Optional" validationMessage={errors.phone}>
                  <Input type="tel" value={fields.phone} onChange={set('phone')} />
                </Field>
              </div>

              <Field label="Subject" required validationMessage={errors.subject}>
                <Input value={fields.subject} onChange={set('subject')} placeholder="e.g. Unpaid dividend" />
              </Field>
              <Field label="What did they ask?" required validationMessage={errors.details}>
                <Textarea value={fields.details} onChange={set('details')} rows={5} resize="vertical" />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Folder">
                  <Dropdown
                    placeholder="No folder"
                    value={folderName ?? ''}
                    selectedOptions={folderId ? [folderId] : []}
                    onOptionSelect={(_, d) => setFolderId(d.optionValue || null)}
                  >
                    <Option value="">No folder</Option>
                    {folders.map((f) => (
                      <Option key={f.id} value={f.id}>
                        {f.name}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field label="Categories">
                  <Dropdown
                    multiselect
                    placeholder="None"
                    value={categoryNames.join(', ')}
                    selectedOptions={categoryIds}
                    onOptionSelect={(_, d) => setCategoryIds(d.selectedOptions)}
                  >
                    {categories.map((c) => (
                      <Option key={c.id} value={c.id} text={c.name}>
                        <span className="flex items-center gap-2">
                          <CategorySwatch color={c.color} />
                          {c.name}
                        </span>
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <Field label="Priority">
                  <Dropdown
                    value={PRIORITY_LABELS[priority]}
                    selectedOptions={[priority]}
                    onOptionSelect={(_, d) => d.optionValue && setPriority(d.optionValue as TicketPriority)}
                  >
                    {[...TICKET_PRIORITIES].reverse().map((p) => (
                      <Option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                <Checkbox
                  label="Assign to me"
                  checked={assignToMe}
                  onChange={(_, d) => setAssignToMe(Boolean(d.checked))}
                />
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                type="submit"
                disabled={saving}
                icon={saving ? <Spinner size="tiny" /> : undefined}
              >
                {saving ? 'Logging…' : 'Log enquiry'}
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}
