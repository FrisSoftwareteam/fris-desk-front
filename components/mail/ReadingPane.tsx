'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  makeStyles,
  Menu,
  MenuButton,
  MenuItem,
  MenuItemCheckbox,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Option,
  SplitButton,
  Spinner,
  Text,
  Tooltip,
  tokens,
  type MenuButtonProps,
} from '@fluentui/react-components';
import {
  ArrowForwardRegular,
  ArrowUndoRegular,
  DeleteRegular,
  ArrowLeftRegular,
  ArrowReplyAllRegular,
  ArrowReplyRegular,
  ArrowRoutingRegular,
  FolderRegular,
  CallRegular,
  EyeRegular,
  FlagFilled,
  FlagRegular,
  MailReadRegular,
  NoteRegular,
  PeopleTeamRegular,
  PersonRegular,
  PersonWalkingRegular,
  TagRegular,
} from '@fluentui/react-icons';
import {
  PRIORITY_LABELS,
  TICKET_PRIORITIES,
  type ComposeKind,
  type PresenceViewerDto,
  type TicketDetailDto,
  type SendResultDto,
  type TicketPriority,
} from '@/lib/shared';
import { api } from '@/lib/api';
import { Composer, type ComposeState } from '@/components/compose/Composer';
import { EscalateDialog } from './EscalateDialog';
import { useDeletion } from './useDeletion';
import { ConfirmDelete } from '@/components/admin/common';
import { formatFullDateTime } from '@/lib/format';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { usePresence } from '@/components/realtime/RealtimeProvider';
import { CategoryPill, CategorySwatch } from './CategoryPill';
import { MessageCard } from './MessageCard';
import { PendingReplyCard } from './PendingReplyCard';
import { useNotify } from '@/lib/notify';
import { TicketHistory } from './TicketHistory';
import { SlaChip } from './SlaChip';
import { queryKeys, useMailbox, useMailboxStatus, useTicket } from './MailboxContext';
import {
  FollowUpMenu,
  PriorityIcon,
  patchForStatusChoice,
  statusChoices,
  statusChoiceValue,
  statusText,
} from './ticketOps';

/** "Ade", "Ade and Bola", "Ade, Bola and 2 others". */
function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} other${names.length > 3 ? 's' : ''}`;
}

/** Starting state for a new reply / reply-all / forward / note, like Outlook. */
function newCompose(kind: ComposeKind, ticket: TicketDetailDto, mailboxAddress: string | null): ComposeState {
  const prefix = (p: string) =>
    ticket.subject.toUpperCase().startsWith(p) ? ticket.subject : `${p} ${ticket.subject}`;
  const contact = ticket.contact.email ? [ticket.contact] : [];
  const base = { cc: [], bodyHtml: '', attachments: [] };
  switch (kind) {
    case 'reply':
      return { ...base, kind, to: contact, subject: prefix('RE:') };
    case 'reply_all': {
      // Everyone on the newest email, except the shared mailbox itself and the shareholder.
      const last = ticket.messages.find((m) => m.direction === 'inbound');
      const skip = new Set([mailboxAddress?.toLowerCase(), ticket.contact.email.toLowerCase()]);
      const cc = [...(last?.to ?? []), ...(last?.cc ?? [])].filter(
        (r, i, all) => r.email && !skip.has(r.email.toLowerCase()) && all.findIndex((x) => x.email === r.email) === i,
      );
      return { ...base, kind, to: contact, cc, subject: prefix('RE:') };
    }
    case 'forward':
      return { ...base, kind, to: [], subject: prefix('FW:') };
    case 'note':
      return { ...base, kind, to: [], subject: '' };
  }
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL} ${tokens.spacingVerticalS}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  subject: {
    flex: 1,
    minWidth: 0,
    margin: 0,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    fontWeight: tokens.fontWeightSemibold,
    overflowWrap: 'anywhere',
  },
  refRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  control: {
    minWidth: '0',
  },
  priority: {
    minWidth: '110px',
  },
  stage: {
    paddingInlineStart: tokens.spacingHorizontalXL,
  },
  pills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
  },
  spacer: { flex: 1 },
  banner: {
    margin: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXL} 0`,
  },
  thread: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL} ${tokens.spacingVerticalXXL}`,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXS,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalS,
    height: '100%',
    padding: tokens.spacingHorizontalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

interface ReadingPaneProps {
  ticketId: string | null;
  /** Shown in the one-pane (phone) layout to return to the list. */
  onBack?: () => void;
  /** Called when the open enquiry no longer exists (permanently deleted). */
  onClosed?: () => void;
}

export function ReadingPane({ ticketId, onBack, onClosed }: ReadingPaneProps) {
  const styles = useStyles();
  const {
    categories,
    categoryById,
    officers,
    statusReasons,
    statusReasonById,
    updateTicket,
    assign,
    toggleCategory,
    markRead,
    folders,
    moveToFolder,
  } = useMailbox();
  const query = useTicket(ticketId);
  const ticket = query.data;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const mailboxAddress = useMailboxStatus((m) => m.address);
  const queryClient = useQueryClient();
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const composeRef = useRef<HTMLDivElement>(null);
  const [escalating, setEscalating] = useState<{ departmentId: string | null } | null>(null);
  const me = useCurrentUser();
  const notify = useNotify();
  // Collision detection: who else has this enquiry open, and whether they're writing a reply.
  const presence = usePresence(ticketId, me.id);
  const { setReplying } = presence;
  useEffect(() => {
    if (!compose || compose.kind === 'note') setReplying(false);
  }, [compose, setReplying]);
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api.departments(), staleTime: 5 * 60_000 });

  // Outlook-style: reopening an enquiry brings back the officer's unsent draft.
  const draft = useQuery({
    queryKey: ['draft', ticketId],
    queryFn: () => api.draft(ticketId!),
    enabled: Boolean(ticketId),
    // Always re-check when an enquiry opens: the draft may have been saved since it was last read.
    refetchOnMount: 'always',
    staleTime: Infinity,
  });
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (restoredOnce.current || !draft.data) return;
    restoredOnce.current = true;
    const d = draft.data;
    setCompose({ ...d, restoredAt: d.updatedAt });
  }, [draft.data]);

  useEffect(() => {
    if (compose) composeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [compose?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCompose = (kind: ComposeKind) => {
    if (!ticket) return;
    // A saved draft of the same kind is picked up rather than starting over.
    const saved = draft.data?.kind === kind ? { ...draft.data, restoredAt: draft.data.updatedAt } : null;
    setCompose(saved ?? newCompose(kind, ticket, mailboxAddress ?? null));
  };

  const onSent = ({ heldForApproval, ...updated }: SendResultDto) => {
    queryClient.setQueryData(queryKeys.ticket(updated.id), updated);
    if (heldForApproval) {
      notify('Sent to a supervisor for approval', `It goes out once approved. ${heldForApproval}.`, 'info');
    }
    queryClient.setQueryData(['draft', updated.id], null);
    void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.counts });
    setCompose(null);
  };

  if (ticketId && query.isPending) {
    return (
      <div className={styles.empty}>
        <Spinner size="small" label="Opening enquiry" />
      </div>
    );
  }

  if (ticketId && query.isError) {
    return (
      <div className={styles.empty}>
        <MessageBar intent="error">
          <MessageBarBody>{query.error.message}</MessageBarBody>
        </MessageBar>
        <Button size="small" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className={styles.empty}>
        <MailReadRegular fontSize={48} />
        <Text weight="semibold">Select an enquiry to read it</Text>
        <Text size={200}>Choose one from the list. Use the up and down arrow keys to move between enquiries.</Text>
      </div>
    );
  }

  const ticketCategories = ticket.categoryIds.map((id) => categoryById.get(id)).filter((c) => c !== undefined);
  // Newest first; the newest message is open, earlier ones collapsed until clicked.
  const isOpen = (id: string, index: number) => expanded[id] ?? index === 0;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {onBack && (
            <Button appearance="subtle" icon={<ArrowLeftRegular />} aria-label="Back to list" onClick={onBack} />
          )}
          <h2 className={styles.subject}>{ticket.subject}</h2>
          {!ticket.deletedAt && (
            <Tooltip content="Mark as unread" relationship="label">
              <Button appearance="subtle" icon={<MailReadRegular />} onClick={() => markRead(ticket.id, false)} />
            </Tooltip>
          )}
        </div>

        <div className={styles.refRow}>
          <Text size={200} weight="semibold">
            {ticket.reference}
          </Text>
          {ticket.origin === 'phone' && (
            <Badge appearance="outline" color="informative" icon={<CallRegular />}>
              Phone call
            </Badge>
          )}
          {ticket.origin === 'walk_in' && (
            <Badge appearance="outline" color="informative" icon={<PersonWalkingRegular />}>
              Walk-in
            </Badge>
          )}
          {(ticket.priority === 'urgent' || ticket.priority === 'high') && (
            <Badge
              appearance="tint"
              color={ticket.priority === 'urgent' ? 'danger' : 'warning'}
              icon={<PriorityIcon priority={ticket.priority} />}
            >
              {PRIORITY_LABELS[ticket.priority]} priority
            </Badge>
          )}
          {ticket.status !== 'resolved' && <SlaChip createdAt={ticket.createdAt} dueAt={ticket.slaDueAt} />}
          {ticket.contact.phone && (
            <Text size={200} className="flex items-center gap-1">
              <CallRegular aria-hidden />
              <a href={`tel:${ticket.contact.phone.replace(/[^\d+]/g, '')}`}>{ticket.contact.phone}</a>
            </Text>
          )}
        </div>

        {!ticket.deletedAt && (
          <div className={styles.controls}>
            {/* Built-in statuses with any stages an admin added under them (G-04.7). */}
            <Dropdown
              className={styles.control}
              size="small"
              aria-label="Status"
              value={statusText(ticket, statusReasonById)}
              selectedOptions={[statusChoiceValue(ticket)]}
              onOptionSelect={(_, d) => d.optionValue && updateTicket(ticket.id, patchForStatusChoice(d.optionValue))}
            >
              {statusChoices(statusReasons).map((c) => (
                <Option key={c.value} value={c.value} text={c.label} className={c.isStage ? styles.stage : undefined}>
                  {c.label}
                </Option>
              ))}
            </Dropdown>

            <Dropdown
              className={styles.priority}
              size="small"
              aria-label="Priority"
              value={PRIORITY_LABELS[ticket.priority]}
              selectedOptions={[ticket.priority]}
              button={{
                children: (
                  <span className="flex items-center gap-1.5">
                    <PriorityIcon priority={ticket.priority} />
                    {PRIORITY_LABELS[ticket.priority]}
                  </span>
                ),
              }}
              onOptionSelect={(_, d) =>
                d.optionValue && updateTicket(ticket.id, { priority: d.optionValue as TicketPriority })
              }
            >
              {[...TICKET_PRIORITIES].reverse().map((p) => (
                <Option key={p} value={p} text={PRIORITY_LABELS[p]}>
                  {PRIORITY_LABELS[p]}
                </Option>
              ))}
            </Dropdown>

            <Dropdown
              className={styles.control}
              size="small"
              aria-label="Folder"
              placeholder="No folder"
              value={folders.find((f) => f.id === ticket.folderId)?.name ?? ''}
              selectedOptions={[ticket.folderId ?? '']}
              button={{
                children: (
                  <span className="flex items-center gap-1.5">
                    <FolderRegular aria-hidden />
                    {folders.find((f) => f.id === ticket.folderId)?.name ?? 'No folder'}
                  </span>
                ),
              }}
              onOptionSelect={(_, d) => moveToFolder(ticket.id, d.optionValue || null)}
            >
              <Option value="" text="No folder">
                No folder
              </Option>
              {folders.map((f) => (
                <Option key={f.id} value={f.id} text={f.name}>
                  {f.name}
                </Option>
              ))}
            </Dropdown>

            <Dropdown
              className={styles.control}
              size="small"
              aria-label="Assigned to"
              placeholder="Unassigned"
              value={ticket.assignee?.displayName ?? ''}
              selectedOptions={[ticket.assignee?.id ?? '']}
              button={{
                children: (
                  <span className="flex items-center gap-1.5">
                    {ticket.assignee && <Avatar name={ticket.assignee.displayName} size={16} />}
                    {ticket.assignee?.displayName ?? 'Unassigned'}
                  </span>
                ),
              }}
              onOptionSelect={(_, d) => assign(ticket.id, d.optionValue || null)}
            >
              <Option value="" text="Unassigned">
                Unassigned
              </Option>
              {officers.map((o) => (
                <Option key={o.id} value={o.id} text={o.displayName}>
                  <span className="flex items-center gap-2">
                    <Avatar name={o.displayName} size={20} />
                    {o.displayName}
                  </span>
                </Option>
              ))}
            </Dropdown>

            <Menu
              checkedValues={{ categories: ticket.categoryIds }}
              onCheckedValueChange={(_, d) => {
                const added = d.checkedItems.find((c) => !ticket.categoryIds.includes(c));
                const removed = ticket.categoryIds.find((c) => !d.checkedItems.includes(c));
                const changed = added ?? removed;
                if (changed) toggleCategory(ticket, changed);
              }}
            >
              <MenuTrigger disableButtonEnhancement>
                <MenuButton size="small" icon={<TagRegular />}>
                  Categorise
                </MenuButton>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {categories.map((c) => (
                    <MenuItemCheckbox
                      key={c.id}
                      name="categories"
                      value={c.id}
                      icon={<CategorySwatch color={c.color} />}
                    >
                      {c.name}
                    </MenuItemCheckbox>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>

            <FollowUpMenu current={ticket.followUp} onChange={(followUp) => updateTicket(ticket.id, { followUp })}>
              <MenuButton size="small" icon={ticket.followUp ? <FlagFilled /> : <FlagRegular />}>
                Follow up
              </MenuButton>
            </FollowUpMenu>

            <span className={styles.spacer} />

            <Menu positioning="below-end">
              <MenuTrigger disableButtonEnhancement>
                {(triggerProps: MenuButtonProps) => (
                  <SplitButton
                    size="small"
                    icon={<ArrowRoutingRegular />}
                    menuButton={triggerProps}
                    primaryActionButton={{
                      onClick: () => setEscalating({ departmentId: null }),
                      disabled: ticket.status === 'resolved',
                      title: ticket.status === 'resolved' ? 'Reopen the enquiry to escalate it' : undefined,
                    }}
                  >
                    Escalate
                  </SplitButton>
                )}
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {(departments.data ?? []).map((d) => (
                    <MenuItem
                      key={d.id}
                      icon={d.type === 'person' ? <PersonRegular /> : <PeopleTeamRegular />}
                      secondaryContent={d.description}
                      disabled={ticket.status === 'resolved'}
                      onClick={() => setEscalating({ departmentId: d.id })}
                    >
                      {d.name}
                    </MenuItem>
                  ))}
                  {departments.data?.length === 0 && (
                    <MenuItem disabled>No teams yet — an admin adds them in Admin → Departments</MenuItem>
                  )}
                </MenuList>
              </MenuPopover>
            </Menu>
            <EscalateDialog
              ticket={ticket}
              departments={departments.data ?? []}
              departmentId={escalating?.departmentId ?? null}
              open={escalating !== null}
              onOpenChange={(open) => !open && setEscalating(null)}
              onEscalated={(updated) => {
                // Unlike sending, escalating leaves any reply being written open.
                setEscalating(null);
                queryClient.setQueryData(queryKeys.ticket(updated.id), updated);
                void queryClient.invalidateQueries({ queryKey: ['history', updated.id] });
                void queryClient.invalidateQueries({ queryKey: ['tickets'] });
                void queryClient.invalidateQueries({ queryKey: queryKeys.counts });
              }}
            />
          </div>
        )}

        {ticketCategories.length > 0 && (
          <div className={styles.pills}>
            {ticketCategories.map((c) => (
              <CategoryPill key={c.id} category={c} />
            ))}
          </div>
        )}
      </div>

      {ticket.followUp && !ticket.deletedAt && (
        <MessageBar
          intent={ticket.followUp.isDue ? 'warning' : 'info'}
          icon={<FlagRegular />}
          className={styles.banner}
        >
          <MessageBarBody>
            {ticket.followUp.isDue ? 'Follow-up due ' : 'Follow up by '}
            {formatFullDateTime(ticket.followUp.at)}
            {ticket.followUp.note && <> — {ticket.followUp.note}</>}
            {ticket.followUp.setBy && <> (set by {ticket.followUp.setBy.displayName})</>}
            {ticket.followUp.hide && !ticket.followUp.isDue && '. Hidden from the list until then.'}
          </MessageBarBody>
          <MessageBarActions>
            <Button size="small" onClick={() => updateTicket(ticket.id, { followUp: null })}>
              Mark complete
            </Button>
          </MessageBarActions>
        </MessageBar>
      )}
      {ticket.deletedAt && <DeletedBanner ticket={ticket} className={styles.banner} onPurged={onClosed} />}
      <CollisionBanner others={presence.others} className={styles.banner} />

      <div className={styles.thread}>
        {!compose && !ticket.deletedAt && (
          <div className={styles.actions}>
            <Button icon={<ArrowReplyRegular />} onClick={() => openCompose('reply')} disabled={!ticket.contact.email}>
              Reply
            </Button>
            <Button
              icon={<ArrowReplyAllRegular />}
              onClick={() => openCompose('reply_all')}
              disabled={!ticket.contact.email}
            >
              Reply all
            </Button>
            <Button icon={<ArrowForwardRegular />} onClick={() => openCompose('forward')}>
              Forward
            </Button>
            <Button icon={<NoteRegular />} onClick={() => openCompose('note')}>
              Add note
            </Button>
          </div>
        )}
        {ticket.pendingReplies.map((r) => (
          <PendingReplyCard key={r.id} reply={r} ticket={ticket} />
        ))}
        {compose && (
          <div
            ref={composeRef}
            // Starting to write tells the others (an internal note can't duplicate a reply).
            onFocusCapture={() => compose.kind !== 'note' && setReplying(true)}
          >
            <Composer
              key={compose.kind}
              ticket={ticket}
              initial={compose}
              onClose={() => {
                queryClient.setQueryData(['draft', ticket.id], null);
                setCompose(null);
              }}
              onSent={onSent}
            />
          </div>
        )}
        {ticket.messages.map((m, i) => (
          <MessageCard
            key={m.id}
            message={m}
            open={isOpen(m.id, i)}
            onToggle={() => setExpanded((e) => ({ ...e, [m.id]: !isOpen(m.id, i) }))}
          />
        ))}
        <TicketHistory key={ticket.id} ticketId={ticket.id} />
      </div>
    </div>
  );
}

/** "● Ade is viewing this enquiry" — or a warning when someone is already writing a reply. */
function CollisionBanner({ others, className }: { others: PresenceViewerDto[]; className: string }) {
  if (others.length === 0) return null;
  const replying = others.filter((o) => o.replying);
  if (replying.length > 0) {
    return (
      <MessageBar intent="warning" className={className} role="status">
        <MessageBarBody>
          <strong>{joinNames(replying.map((o) => o.displayName))}</strong> {replying.length === 1 ? 'is' : 'are'}{' '}
          writing a reply to this enquiry. Check with them before you reply, so the shareholder doesn&apos;t get two
          answers.
        </MessageBarBody>
      </MessageBar>
    );
  }
  return (
    <MessageBar intent="info" icon={<EyeRegular />} className={className} role="status">
      <MessageBarBody>
        {joinNames(others.map((o) => o.displayName))} {others.length === 1 ? 'is' : 'are'} viewing this enquiry
      </MessageBarBody>
    </MessageBar>
  );
}

const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** A deleted enquiry is read-only: say who deleted it and when it goes for good, and offer Restore. */
function DeletedBanner({
  ticket,
  className,
  onPurged,
}: {
  ticket: TicketDetailDto;
  className: string;
  onPurged?: () => void;
}) {
  const deletion = useDeletion();
  const [confirming, setConfirming] = useState(false);
  const when = formatFullDateTime(ticket.deletedAt!);
  return (
    <>
      <MessageBar intent="warning" className={className} icon={<DeleteRegular />}>
        <MessageBarBody>
          In Deleted items: deleted{' '}
          {ticket.deletedBy ? `by ${ticket.deletedBy.displayName}` : 'automatically (retention schedule or system)'} on{' '}
          {when}.{' '}
          {ticket.purgeAt
            ? `It will be permanently deleted on ${longDate.format(new Date(ticket.purgeAt))}.`
            : 'It stays here until someone restores or permanently deletes it.'}
        </MessageBarBody>
        <MessageBarActions>
          {deletion.canDelete && (
            <Button size="small" icon={<ArrowUndoRegular />} onClick={() => void deletion.restore(ticket)}>
              Restore
            </Button>
          )}
          {deletion.canPurge && (
            <Button size="small" appearance="subtle" onClick={() => setConfirming(true)}>
              Delete permanently
            </Button>
          )}
        </MessageBarActions>
      </MessageBar>
      <ConfirmDelete
        what={confirming ? `${ticket.reference} permanently` : null}
        consequence="Its messages, notes, attachment copies and history are removed from Registrar Desk and can't be recovered. (Emails stay in the shared mailbox.)"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await deletion.purge(ticket);
          onPurged?.();
        }}
      />
    </>
  );
}
