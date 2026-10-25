'use client';

import {
  Avatar,
  makeStyles,
  Menu,
  MenuDivider,
  MenuItem,
  MenuItemCheckbox,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowUndoRegular,
  CheckmarkCircleRegular,
  DeleteRegular,
  DismissRegular,
  FlagRegular,
  FolderArrowRightRegular,
  FolderRegular,
  ImportantRegular,
  MailReadRegular,
  MailUnreadRegular,
  PeopleRegular,
  PersonAddRegular,
  StatusRegular,
  TagRegular,
} from '@fluentui/react-icons';
import { PRIORITY_LABELS, TICKET_PRIORITIES, type BulkTicketPatchDto, type TicketSummaryDto } from '@/lib/shared';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { CategorySwatch } from './CategoryPill';
import { useMailbox, useTicket } from './MailboxContext';
import { useDeletion } from './useDeletion';
import {
  FollowUpMenu,
  PriorityIcon,
  patchForStatusChoice,
  statusChoices,
  statusChoiceValue,
  useListedTickets,
} from './ticketOps';

const useStyles = makeStyles({
  bar: {
    minHeight: '40px',
    paddingInline: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
    overflowX: 'auto',
    // Keep labels on one line; the bar scrolls sideways when the window is narrow.
    '& > *': { flexShrink: 0, whiteSpace: 'nowrap' },
  },
  count: {
    paddingInline: tokens.spacingHorizontalS,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
  },
  stage: { paddingInlineStart: tokens.spacingHorizontalL },
});

type BulkPatch = BulkTicketPatchDto['patch'];

interface CommandBarProps {
  /** The enquiry open in the reading pane. */
  ticketId: string | null;
  /** Enquiries ticked in the list; when there are any, every action applies to all of them. */
  selection: string[];
  onClearSelection: () => void;
}

/** Simplified ribbon (Outlook "Home" tab) acting on the open enquiry or the selected ones. */
export function CommandBar({ ticketId, selection, onClearSelection }: CommandBarProps) {
  const styles = useStyles();
  const user = useCurrentUser();
  const mailbox = useMailbox();
  const { categories, folders, officers, statusReasons, updateTicket, bulkUpdate, bulkRestore } = mailbox;
  const bulk = selection.length > 0;
  // Shares the reading pane's cached copy of the open ticket.
  const { data: open } = useTicket(bulk ? null : ticketId);
  const listed = useListedTickets(selection);
  const targets: TicketSummaryDto[] = bulk ? listed : open ? [open] : [];
  const deletion = useDeletion();

  // Deleted enquiries are read-only until restored (Deleted items lists only deleted ones).
  const deleted = targets.length > 0 && targets.every((t) => t.deletedAt);
  const none = targets.length === 0 || targets.some((t) => t.deletedAt);
  const canAssignOthers = user.role !== 'agent';

  /** One change for the open enquiry (instant) or the selection (one request). */
  const apply = (patch: BulkPatch) => {
    if (bulk) {
      void bulkUpdate(selection, patch);
      return;
    }
    if (!open) return;
    const { addCategoryIds, removeCategoryIds, ...rest } = patch;
    const categoryIds =
      addCategoryIds || removeCategoryIds
        ? [...new Set([...open.categoryIds, ...(addCategoryIds ?? [])])].filter((c) => !removeCategoryIds?.includes(c))
        : undefined;
    updateTicket(open.id, { ...rest, ...(categoryIds && { categoryIds }) });
  };

  // A category is ticked when every target has it; ticking adds it to all, unticking removes it from all.
  const allHave = categories.filter((c) => targets.length && targets.every((t) => t.categoryIds.includes(c.id)));
  const anyUnread = targets.some((t) => t.isUnread);
  const allMine = targets.length > 0 && targets.every((t) => t.assignee?.id === user.id);
  const sameStatus = targets.length && targets.every((t) => statusChoiceValue(t) === statusChoiceValue(targets[0]!));
  const samePriority = targets.length && targets.every((t) => t.priority === targets[0]!.priority);

  return (
    <Toolbar
      className={styles.bar}
      aria-label={bulk ? 'Actions for the selected enquiries' : 'Enquiry actions'}
      size="small"
    >
      {bulk && (
        <>
          <ToolbarButton icon={<DismissRegular />} aria-label="Clear selection" onClick={onClearSelection} />
          <span className={styles.count} role="status">
            {selection.length} selected
          </span>
          <ToolbarDivider />
        </>
      )}

      {/* For a selection, supervisors get one Assign menu (with themselves first) to keep the bar short. */}
      {!(bulk && canAssignOthers) && (
        <ToolbarButton
          icon={<PersonAddRegular />}
          disabled={none || allMine}
          onClick={() => apply({ assigneeId: user.id })}
        >
          Assign to me
        </ToolbarButton>
      )}

      {bulk && canAssignOthers && (
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <ToolbarButton icon={<PeopleRegular />} disabled={none}>
              Assign
            </ToolbarButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<PersonAddRegular />} onClick={() => apply({ assigneeId: user.id })}>
                Assign to me
              </MenuItem>
              <MenuDivider />
              {officers.map((o) => (
                <MenuItem
                  key={o.id}
                  icon={<Avatar name={o.displayName} size={20} />}
                  onClick={() => apply({ assigneeId: o.id })}
                >
                  {o.displayName}
                </MenuItem>
              ))}
              <MenuDivider />
              <MenuItem onClick={() => apply({ assigneeId: null })}>Unassign</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      )}

      <Menu
        checkedValues={{ categories: allHave.map((c) => c.id) }}
        onCheckedValueChange={(_, d) => {
          const was = allHave.map((c) => c.id);
          const added = d.checkedItems.find((c) => !was.includes(c));
          const removed = was.find((c) => !d.checkedItems.includes(c));
          if (added) apply({ addCategoryIds: [added] });
          else if (removed) apply({ removeCategoryIds: [removed] });
        }}
      >
        <MenuTrigger disableButtonEnhancement>
          <ToolbarButton icon={<TagRegular />} disabled={none}>
            Categorise
          </ToolbarButton>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {categories.map((c) => (
              <MenuItemCheckbox key={c.id} name="categories" value={c.id} icon={<CategorySwatch color={c.color} />}>
                {c.name}
              </MenuItemCheckbox>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>

      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <ToolbarButton icon={<FolderArrowRightRegular />} disabled={none}>
            Move to
          </ToolbarButton>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {folders.map((f) => (
              <MenuItem
                key={f.id}
                icon={<FolderRegular />}
                disabled={!bulk && open?.folderId === f.id}
                onClick={() => apply({ folderId: f.id })}
              >
                {f.name}
              </MenuItem>
            ))}
            <MenuDivider />
            <MenuItem disabled={!bulk && !open?.folderId} onClick={() => apply({ folderId: null })}>
              Remove from folder
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>

      {bulk && (
        <Menu
          checkedValues={{ status: sameStatus ? [statusChoiceValue(targets[0]!)] : [] }}
          onCheckedValueChange={(_, d) => d.checkedItems[0] && apply(patchForStatusChoice(d.checkedItems[0]))}
        >
          <MenuTrigger disableButtonEnhancement>
            <ToolbarButton icon={<StatusRegular />} disabled={none}>
              Status
            </ToolbarButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {statusChoices(statusReasons).map((c) => (
                <MenuItemRadio
                  key={c.value}
                  name="status"
                  value={c.value}
                  className={c.isStage ? styles.stage : undefined}
                >
                  {c.label}
                </MenuItemRadio>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      )}

      <Menu
        checkedValues={{ priority: samePriority ? [targets[0]!.priority] : [] }}
        onCheckedValueChange={(_, d) =>
          d.checkedItems[0] && apply({ priority: d.checkedItems[0] as (typeof TICKET_PRIORITIES)[number] })
        }
      >
        <MenuTrigger disableButtonEnhancement>
          <ToolbarButton icon={<ImportantRegular />} disabled={none}>
            Priority
          </ToolbarButton>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {[...TICKET_PRIORITIES].reverse().map((p) => (
              <MenuItemRadio key={p} name="priority" value={p} icon={<PriorityIcon priority={p} />}>
                {PRIORITY_LABELS[p]}
              </MenuItemRadio>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>

      <FollowUpMenu
        current={bulk ? undefined : (open?.followUp ?? null)}
        disabled={none}
        onChange={(followUp) => apply({ followUp })}
      >
        <ToolbarButton icon={<FlagRegular />} disabled={none}>
          Follow up
        </ToolbarButton>
      </FollowUpMenu>

      <ToolbarButton
        icon={anyUnread ? <MailReadRegular /> : <MailUnreadRegular />}
        disabled={none}
        onClick={() => apply({ isUnread: !anyUnread })}
      >
        {anyUnread ? 'Mark as read' : 'Mark as unread'}
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        icon={<CheckmarkCircleRegular />}
        disabled={none || targets.every((t) => t.status === 'resolved')}
        onClick={() => apply({ status: 'resolved', statusReasonId: null })}
      >
        Resolve
      </ToolbarButton>

      {deletion.canDelete &&
        (deleted ? (
          <ToolbarButton
            icon={<ArrowUndoRegular />}
            onClick={() =>
              bulk ? void bulkRestore(selection).then(onClearSelection) : open && void deletion.restore(open)
            }
          >
            Restore
          </ToolbarButton>
        ) : (
          <ToolbarButton
            icon={<DeleteRegular />}
            disabled={none}
            onClick={() =>
              bulk
                ? void deletion.removeMany(selection).then((done) => done && onClearSelection())
                : open && void deletion.remove(open)
            }
          >
            Delete
          </ToolbarButton>
        ))}
    </Toolbar>
  );
}
