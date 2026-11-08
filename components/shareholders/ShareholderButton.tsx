'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@fluentui/react-components';
import { PersonAddRegular, PersonRegular } from '@fluentui/react-icons';
import type { ContactDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { queryKeys } from '@/components/mail/MailboxContext';
import { ShareholderDialog } from './ShareholderDialog';

/** On an enquiry: open the sender's saved shareholder record, or save one prefilled from the enquiry. */
export function ShareholderButton({ contact }: { contact: ContactDto }) {
  const [open, setOpen] = useState(false);
  const saved = useQuery({
    queryKey: queryKeys.shareholderByEmail(contact.email),
    queryFn: () => api.shareholders.byEmail(contact.email),
    enabled: !!contact.email,
    staleTime: 60_000,
  });
  if (!contact.email || saved.isPending || saved.isError) return null;
  const record = saved.data ?? null;

  return (
    <>
      <Button
        size="small"
        appearance={record ? 'outline' : 'subtle'}
        icon={record ? <PersonRegular /> : <PersonAddRegular />}
        onClick={() => setOpen(true)}
      >
        {record ? 'Shareholder record' : 'Save shareholder'}
      </Button>
      <ShareholderDialog
        open={open}
        record={record}
        prefill={{ name: contact.name, email: contact.email, phone: contact.phone ?? '' }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
