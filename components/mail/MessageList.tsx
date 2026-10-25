'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Avatar,
  Button,
  makeStyles,
  Spinner,
  mergeClasses,
  Tab,
  TabList,
  Text,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  AttachRegular,
  CallRegular,
  CheckboxCheckedFilled,
  CheckboxUncheckedRegular,
  ClockAlarmRegular,
  FlagFilled,
  FlagRegular,
  NavigationRegular,
  PanelLeftContractRegular,
  PersonWalkingRegular,
  SelectAllOnRegular,
} from '@fluentui/react-icons';
import type { TicketSummaryDto } from '@/lib/shared';
import { api } from '@/lib/api';
import { dateGroup, formatFullDateTime, formatListTime } from '@/lib/format';
import { CategoryPill } from './CategoryPill';
import { queryKeys, useMailbox, type ViewId } from './MailboxContext';
import { useRefreshInterval } from '@/components/realtime/RealtimeProvider';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { useNotify } from '@/lib/notify';
import { PriorityIcon } from './ticketOps';

export type ListTab = 'open' | 'resolved';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0`,
  },
  title: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tabs: {
    paddingInline: tokens.spacingHorizontalXS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  scroller: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    outlineStyle: 'none',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    height: '32px',
    paddingInline: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalXS,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  row: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '32px 1fr',
    columnGap: tokens.spacingHorizontalM,
    width: '100%',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`,
    border: 'none',
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground1,
    textAlign: 'start',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground1,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
    },
  },
  rowSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    ':hover': { backgroundColor: tokens.colorBrandBackground2Hover },
  },
  // Outlook-style: hovering the avatar turns it into a tick box; while selecting, every row shows one.
  rowHoverCheck: {
    ':hover [data-role="avatar"]': { display: 'none' },
    ':hover [data-role="check"]': { display: 'inline-flex' },
  },
  checkSlot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
  },
  check: {
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    fontSize: '20px',
    color: tokens.colorNeutralForeground3,
  },
  checkOn: { display: 'inline-flex', color: tokens.colorBrandForeground1 },
  hidden: { display: 'none' },
  flag: { flexShrink: 0, color: tokens.colorBrandForeground1 },
  unreadBar: {
    position: 'absolute',
    insetBlock: '0',
    insetInlineStart: '0',
    width: '3px',
    backgroundColor: tokens.colorBrandBackground,
  },
  lines: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: '1px',
  },
  line: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
  },
  truncate: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sender: { fontSize: tokens.fontSizeBase300 },
  unreadSender: { fontWeight: tokens.fontWeightSemibold },
  subject: { fontSize: tokens.fontSizeBase200 },
  unreadSubject: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1 },
  snippet: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  draft: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold, marginInlineEnd: '4px' },
  meta: {
    flexShrink: 0,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  unreadMeta: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  icon: { flexShrink: 0, color: tokens.colorNeutralForeground3 },
  urgent: { flexShrink: 0, color: tokens.colorPaletteRedForeground1 },
  pills: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    marginTop: '3px',
    overflow: 'hidden',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalXXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

type Item = { kind: 'group'; label: string } | { kind: 'ticket'; ticket: TicketSummaryDto };

/** How a row was picked: plain click opens it; Ctrl/Cmd or its tick box toggles it; Shift selects a range. */
export type PickMode = 'open' | 'toggle' | 'range';

interface MessageListProps {
  view: ViewId;
  tab: ListTab;
  onTabChange: (tab: ListTab) => void;
  search: string;
  selectedId: string | null;
  /** Ticked enquiries (bulk actions, G-04.2). */
  checkedIds: Set<string>;
  /** `order` is every loaded row's id, top to bottom, for range selection. */
  onPick: (ticket: TicketSummaryDto, mode: PickMode, order: string[]) => void;
  onCheckAll: (ids: string[]) => void;
  onClearChecked: () => void;
  /** Shown when the folder pane is in a drawer (narrow layouts). */
  onOpenFolders?: () => void;
  /** Collapses the list so the reading pane gets the width (not on phones). */
  onHideList?: () => void;
}

export function MessageList({
  view,
  tab,
  onTabChange,
  search,
  selectedId,
  checkedIds,
  onPick,
  onCheckAll,
  onClearChecked,
  onOpenFolders,
  onHideList,
}: MessageListProps) {
  const styles = useStyles();
  // Select mode (for touch screens): tapping a row ticks it instead of opening it.
  const [selectMode, setSelectMode] = useState(false);
  const selecting = selectMode || checkedIds.size > 0;
  const { viewName } = useMailbox();
  const refreshMs = useRefreshInterval();
  const q = search.trim();
  const user = useCurrentUser();
  const notify = useNotify();
  const [exporting, setExporting] = useState(false);
  // Everything in this view (not just the loaded page), with shareholder details: supervisors and admins.
  const canExport = user.role !== 'agent';
  const exportList = async () => {
    setExporting(true);
    try {
      await api.exportTickets({ view, tab, q });
    } catch (err) {
      notify("Couldn't export", (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const list = useInfiniteQuery({
    queryKey: queryKeys.tickets(view, tab, q),
    queryFn: ({ pageParam }) => api.tickets({ view, tab, q, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // Keep showing the current list while a new search loads, instead of flashing empty.
    placeholderData: keepPreviousData,
    refetchInterval: refreshMs,
  });
  const tickets = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const order = useMemo(() => tickets.map((t) => t.id), [tickets]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let current = '';
    for (const t of tickets) {
      const g = dateGroup(t.lastMessageAt);
      if (g !== current) {
        out.push({ kind: 'group', label: g });
        current = g;
      }
      out.push({ kind: 'ticket', ticket: t });
    }
    return out;
  }, [tickets]);

  // Roving tab stop: Tab lands on the selected row (or the first row), arrows move between rows.
  const tabbableId = tickets.some((t) => t.id === selectedId) ? selectedId : (tickets[0]?.id ?? null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (i) => (items[i]?.kind === 'group' ? 32 : 108),
    overscan: 8,
  });

  // Load the next page when the last rows come into view.
  const virtualItems = virtualizer.getVirtualItems();
  const lastVisible = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastVisible >= items.length - 10) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, lastVisible, items.length]);

  // Keep the selected row in view when the selection changes (keyboard, opening from a link) — once
  // per selection: a background refresh rebuilding the list mustn't pull the officer back to it.
  const [focusAfterMove, setFocusAfterMove] = useState(false);
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    const index = items.findIndex((it) => it.kind === 'ticket' && it.ticket.id === selectedId);
    if (index >= 0 && scrolledTo.current !== selectedId) {
      virtualizer.scrollToIndex(index, { align: 'auto' });
      scrolledTo.current = selectedId;
    }
    if (focusAfterMove) {
      scrollerRef.current?.querySelector<HTMLElement>(`[data-ticket-id="${selectedId}"]`)?.focus();
      setFocusAfterMove(false);
    }
  }, [selectedId, items, virtualizer, focusAfterMove]);

  // Up/down arrows move through the list like Outlook; with Shift they extend the selection.
  // Ctrl/Cmd+A selects every loaded enquiry; Escape clears the selection.
  const focusedId = useRef<string | null>(null);
  // One stable handler for every row (read through a ref), so memoised rows skip re-rendering when
  // the list around them refreshes.
  const pickLatest = useRef({ onPick, order });
  pickLatest.current = { onPick, order };
  const pickRow = useCallback((ticket: TicketSummaryDto, mode: PickMode) => {
    focusedId.current = ticket.id;
    pickLatest.current.onPick(ticket, mode, pickLatest.current.order);
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      onCheckAll(order);
      return;
    }
    if (e.key === 'Escape' && checkedIds.size) {
      e.preventDefault();
      onClearChecked();
      setSelectMode(false);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const from = e.shiftKey && focusedId.current ? focusedId.current : selectedId;
    const index = tickets.findIndex((t) => t.id === from);
    const next = tickets[Math.min(Math.max(index + (e.key === 'ArrowDown' ? 1 : -1), 0), tickets.length - 1)];
    if (!next) return;
    if (e.shiftKey) {
      focusedId.current = next.id;
      onPick(next, 'range', order);
      scrollerRef.current?.querySelector<HTMLElement>(`[data-ticket-id="${next.id}"]`)?.focus();
      return;
    }
    focusedId.current = null;
    setFocusAfterMove(true);
    onPick(next, 'open', order);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {onOpenFolders && (
          <Button appearance="subtle" icon={<NavigationRegular />} aria-label="Show folders" onClick={onOpenFolders} />
        )}
        <Text as="h2" size={400} weight="semibold" className={styles.title}>
          {q ? `Results for “${q}”` : viewName(view)}
        </Text>
        <Tooltip content={selecting ? 'Stop selecting' : 'Select enquiries'} relationship="label">
          <Button
            appearance={selecting ? 'primary' : 'subtle'}
            icon={<SelectAllOnRegular />}
            aria-pressed={selecting}
            disabled={!tickets.length}
            onClick={() => {
              if (selecting) onClearChecked();
              setSelectMode(!selecting);
            }}
          />
        </Tooltip>
        {canExport && (
          <Tooltip content="Export this list to CSV" relationship="label">
            <Button
              appearance="subtle"
              icon={exporting ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
              disabled={exporting || !tickets.length}
              onClick={() => void exportList()}
            />
          </Tooltip>
        )}
        {onHideList && (
          <Tooltip content="Hide enquiry list" relationship="label">
            <Button appearance="subtle" icon={<PanelLeftContractRegular />} onClick={onHideList} />
          </Tooltip>
        )}
      </div>
      {/* Search covers every enquiry, open and resolved, and Deleted items shows both, so no tabs. */}
      {!q && view !== 'deleted' && (
        <TabList
          className={styles.tabs}
          size="small"
          selectedValue={tab}
          onTabSelect={(_, d) => onTabChange(d.value as ListTab)}
        >
          <Tab value="open">Open</Tab>
          <Tab value="resolved">Resolved</Tab>
        </TabList>
      )}

      <div ref={scrollerRef} className={styles.scroller} role="list" aria-label="Enquiries" onKeyDown={onKeyDown}>
        {list.isPending ? (
          <div className={styles.empty}>
            <Spinner size="small" label="Loading enquiries" />
          </div>
        ) : list.isError ? (
          <div className={styles.empty}>
            <Text weight="semibold">Enquiries couldn&apos;t load</Text>
            <Text size={200}>{list.error.message}</Text>
            <Button size="small" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : tickets.length === 0 ? (
          <div className={styles.empty}>
            <Text weight="semibold">{search ? 'No enquiries match your search' : 'Nothing here'}</Text>
            <Text size={200}>
              {search
                ? 'Try a name, email address, phone number, reference, or words from the email.'
                : tab === 'open'
                  ? 'Open enquiries in this view will appear here.'
                  : 'Resolved enquiries in this view will appear here.'}
            </Text>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const item = items[v.index]!;
              return (
                <div
                  key={v.key}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${v.start}px)`,
                  }}
                >
                  {item.kind === 'group' ? (
                    <div className={styles.groupHeader} role="presentation">
                      {item.label}
                    </div>
                  ) : (
                    <MessageRow
                      ticket={item.ticket}
                      selected={checkedIds.size ? checkedIds.has(item.ticket.id) : item.ticket.id === selectedId}
                      checked={checkedIds.has(item.ticket.id)}
                      selecting={selecting}
                      tabbable={item.ticket.id === tabbableId}
                      onPick={pickRow}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface MessageRowProps {
  ticket: TicketSummaryDto;
  selected: boolean;
  checked: boolean;
  /** Something is ticked or Select mode is on: every row shows its tick box and a tap toggles it. */
  selecting: boolean;
  tabbable: boolean;
  onPick: (ticket: TicketSummaryDto, mode: PickMode) => void;
}

const MessageRow = memo(function MessageRow({
  ticket: t,
  selected,
  checked,
  selecting,
  tabbable,
  onPick: pick,
}: MessageRowProps) {
  const onPick = (mode: PickMode) => pick(t, mode);
  const styles = useStyles();
  const { categoryById } = useMailbox();
  const unread = t.isUnread;
  const categories = t.categoryIds.map((id) => categoryById.get(id)).filter((c) => c !== undefined);

  return (
    <div role="listitem">
      <button
        type="button"
        data-ticket-id={t.id}
        className={mergeClasses(styles.row, selected && styles.rowSelected)}
        aria-current={selected && !selecting ? 'true' : undefined}
        aria-pressed={selecting ? checked : undefined}
        aria-label={`${checked ? 'Selected. ' : ''}${unread ? 'Unread. ' : ''}${t.contact.name}. ${t.subject}. ${formatListTime(t.lastMessageAt)}`}
        tabIndex={tabbable ? 0 : -1}
        onClick={(e) => {
          const onCheckBox = (e.target as HTMLElement).closest('[data-role="check-slot"]');
          if (e.shiftKey) onPick('range');
          else if (e.ctrlKey || e.metaKey || selecting || onCheckBox) onPick('toggle');
          else onPick('open');
        }}
      >
        {unread && <span className={styles.unreadBar} aria-hidden />}
        <span className={mergeClasses(styles.checkSlot, !selecting && styles.rowHoverCheck)} data-role="check-slot">
          <span data-role="avatar" className={selecting ? styles.hidden : undefined}>
            <Avatar name={t.contact.name} size={32} color="colorful" aria-hidden />
          </span>
          <span data-role="check" className={mergeClasses(styles.check, selecting && styles.checkOn)} aria-hidden>
            {checked ? <CheckboxCheckedFilled /> : <CheckboxUncheckedRegular />}
          </span>
        </span>
        <span className={styles.lines}>
          <span className={styles.line}>
            <span className={mergeClasses(styles.truncate, styles.sender, unread && styles.unreadSender)}>
              {t.contact.name}
            </span>
            {t.origin === 'phone' && (
              <Tooltip content="Logged from a phone call" relationship="label">
                <CallRegular className={styles.icon} />
              </Tooltip>
            )}
            {t.origin === 'walk_in' && (
              <Tooltip content="Logged from a walk-in" relationship="label">
                <PersonWalkingRegular className={styles.icon} />
              </Tooltip>
            )}
            {t.hasAttachments && <AttachRegular className={styles.icon} aria-label="Has attachments" />}
            <PriorityIcon priority={t.priority} />
            {t.followUp && (
              <Tooltip
                content={`Follow up ${formatFullDateTime(t.followUp.at)}${t.followUp.note ? `: ${t.followUp.note}` : ''}`}
                relationship="label"
              >
                {t.followUp.isDue ? <FlagFilled className={styles.urgent} /> : <FlagRegular className={styles.flag} />}
              </Tooltip>
            )}
            {t.isOverdue && t.status !== 'resolved' && (
              <ClockAlarmRegular className={styles.urgent} aria-label="Overdue" />
            )}
          </span>
          <span className={styles.line}>
            <span className={mergeClasses(styles.truncate, styles.subject, unread && styles.unreadSubject)}>
              {t.subject}
            </span>
            <span className={mergeClasses(styles.meta, unread && styles.unreadMeta)}>
              {formatListTime(t.lastMessageAt)}
            </span>
          </span>
          <span className={mergeClasses(styles.truncate, styles.snippet)}>
            {t.hasDraft && <span className={styles.draft}>[Draft]</span>}
            {t.snippet}
          </span>
          {categories.length > 0 && (
            <span className={styles.pills}>
              {categories.map((c) => (
                <CategoryPill key={c.id} category={c} />
              ))}
            </span>
          )}
        </span>
      </button>
    </div>
  );
});
