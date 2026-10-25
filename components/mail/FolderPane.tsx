'use client';

import type { ReactElement } from 'react';
import {
  Button,
  makeStyles,
  mergeClasses,
  Nav,
  NavCategory,
  NavCategoryItem,
  NavItem,
  NavSectionHeader,
  NavSubItem,
  NavSubItemGroup,
  Text,
  tokens,
  Tooltip,
} from '@fluentui/react-components';
import {
  MailMultipleRegular,
  DraftsRegular,
  FolderRegular,
  MailInboxRegular,
  PersonRegular,
  PersonQuestionMarkRegular,
  ClockAlarmRegular,
  ComposeRegular,
  DeleteRegular,
  FlagRegular,
  PanelLeftContractRegular,
  MentionRegular,
  HourglassHalfRegular,
} from '@fluentui/react-icons';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { SyncStatus } from './SyncStatus';
import { CategorySwatch } from './CategoryPill';
import {
  SYSTEM_VIEWS,
  useMailbox,
  useMailboxStatus,
  useTicketCounts,
  type SystemViewId,
  type ViewId,
} from './MailboxContext';

const VIEW_ICONS: Record<SystemViewId, ReactElement> = {
  inbox: <MailInboxRegular />,
  mine: <PersonRegular />,
  mentions: <MentionRegular />,
  approvals: <HourglassHalfRegular />,
  unassigned: <PersonQuestionMarkRegular />,
  overdue: <ClockAlarmRegular />,
  followups: <FlagRegular />,
  drafts: <DraftsRegular />,
  deleted: <DeleteRegular />,
};

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    margin: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS} ${tokens.spacingVerticalM}`,
  },
  newButton: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  nav: {
    backgroundColor: 'transparent',
    paddingInline: tokens.spacingHorizontalXS,
  },
  item: {
    backgroundColor: 'transparent',
    marginBlock: tokens.spacingVerticalXS,
  },
  label: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  count: {
    marginInlineStart: 'auto',
    paddingInlineStart: tokens.spacingHorizontalS,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  overdueCount: {
    color: tokens.colorPaletteRedForeground1,
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBlock: tokens.spacingVerticalXS,
  },
});

interface FolderPaneProps {
  view: ViewId;
  onSelectView: (view: ViewId) => void;
  onNewEnquiry: () => void;
  /** Shown when the pane sits beside the list (wide layout), to give the reading pane more room. */
  onCollapse?: () => void;
}

export function FolderPane({ view, onSelectView, onNewEnquiry, onCollapse }: FolderPaneProps) {
  const styles = useStyles();
  const { folders, categories } = useMailbox();
  const counts = useTicketCounts();
  const mailbox = useMailboxStatus((m) => m.address);
  const user = useCurrentUser();
  const views = SYSTEM_VIEWS.filter((v) => v.id !== 'deleted' || user.role !== 'agent');
  const address = mailbox ?? 'Shared mailbox';

  const label = (text: string, count: number, urgent = false) => (
    <>
      <span className={styles.label}>{text}</span>
      {count > 0 && <span className={mergeClasses(styles.count, urgent && styles.overdueCount)}>{count}</span>}
    </>
  );

  return (
    <div className={styles.root}>
      <div className={styles.top}>
        <Button appearance="primary" icon={<ComposeRegular />} className={styles.newButton} onClick={onNewEnquiry}>
          New enquiry
        </Button>
        {onCollapse && (
          <Tooltip content="Hide folders" relationship="label">
            <Button appearance="subtle" icon={<PanelLeftContractRegular />} onClick={onCollapse} />
          </Tooltip>
        )}
      </div>

      <div className={styles.scroll}>
        <Nav
          className={styles.nav}
          density="small"
          selectedValue={view}
          defaultOpenCategories={['mailbox']}
          onNavItemSelect={(_, data) => onSelectView(data.value as ViewId)}
          aria-label="Folders"
        >
          <NavSectionHeader>Views</NavSectionHeader>
          {views.map((v) => {
            // Like Outlook: Drafts (and Overdue, Follow-ups due) show their total; the rest show unread.
            const count = counts?.views[v.id] ?? 0;
            return (
              <NavItem key={v.id} value={v.id} icon={VIEW_ICONS[v.id]} className={styles.item}>
                {label(v.name, count, v.id === 'overdue' || v.id === 'followups')}
              </NavItem>
            );
          })}

          <NavCategory value="mailbox">
            <NavCategoryItem icon={<MailMultipleRegular />} className={styles.item}>
              <span className={styles.label} title={address}>
                {address}
              </span>
            </NavCategoryItem>
            <NavSubItemGroup>
              {[...folders]
                .sort((a, b) => a.order - b.order)
                .map((f) => {
                  const id: ViewId = `folder:${f.id}`;
                  return (
                    <NavSubItem key={f.id} value={id} className={styles.item}>
                      <span className="flex w-full items-center gap-2">
                        <FolderRegular fontSize={16} />
                        {label(f.name, counts?.folders[f.id] ?? 0)}
                      </span>
                    </NavSubItem>
                  );
                })}
            </NavSubItemGroup>
          </NavCategory>
        </Nav>

        <div className={styles.legend} aria-label="Categories">
          <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3 }}>
            Categories
          </Text>
          {categories.map((c) => (
            <div key={c.id} className={styles.legendRow}>
              <CategorySwatch color={c.color} />
              <Text size={200}>{c.name}</Text>
            </div>
          ))}
        </div>
      </div>
      <SyncStatus />
    </div>
  );
}
