'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { OPEN_TICKET_EVENT, takeTicketFromUrl } from '@/lib/openTicket';
import { useReadTicketNotifications } from '@/components/notifications/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import {
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Button,
  makeStyles,
  Text,
  mergeClasses,
  OverlayDrawer,
  tokens,
  Tooltip,
} from '@fluentui/react-components';
import { DismissRegular, NavigationRegular, PanelLeftExpandRegular, SelectAllOnRegular } from '@fluentui/react-icons';
import type { TicketSummaryDto } from '@/lib/shared';
import { useLayoutMode } from '@/lib/useLayoutMode';
import { useStoredFlag } from '@/lib/useStoredFlag';
import { CommandBar } from './CommandBar';
import { FolderPane } from './FolderPane';
import { queryKeys, useMailbox, type ViewId } from './MailboxContext';
import { NewEnquiryDialog } from './NewEnquiryDialog';
import { MessageList, type ListTab, type PickMode } from './MessageList';
import { ReadingPane } from './ReadingPane';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    height: '100%',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS} ${tokens.spacingVerticalS} 0`,
    '@media (max-width: 767px)': { padding: 0, gap: 0 },
  },
  panes: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  // Clips a collapsing pane. Width and the trailing gap ease shut so the reading pane grows into the room.
  slot: {
    display: 'flex',
    flexShrink: 0,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    opacity: 1,
    transitionProperty: 'width, margin-right, opacity',
    transitionDuration: '360ms',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
      transitionDelay: '0ms',
    },
  },
  folderSlot: {
    width: '232px',
    marginRight: tokens.spacingHorizontalS,
  },
  slotClosed: {
    width: '0px',
    marginRight: '0px',
    opacity: 0,
    pointerEvents: 'none',
  },
  // Fixed inner width: the slot clips it, so labels don't reflow while the pane shrinks.
  folderBody: {
    width: '232px',
    flexShrink: 0,
    height: '100%',
  },
  card: {
    minWidth: 0,
    minHeight: 0,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
    overflow: 'hidden',
    '@media (max-width: 767px)': { borderRadius: 0, boxShadow: 'none' },
  },
  // List and its collapsed rail share one column so the left edge stays put while the width eases.
  listColumn: {
    position: 'relative',
    display: 'flex',
    flexShrink: 0,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    width: 'clamp(320px, 28vw, 520px)',
    marginRight: tokens.spacingHorizontalS,
    transitionProperty: 'width',
    transitionDuration: '360ms',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
      transitionDelay: '0ms',
    },
  },
  listColumnClosed: {
    width: '44px',
  },
  listBody: {
    width: 'clamp(320px, 28vw, 520px)',
    flexShrink: 0,
    height: '100%',
    minHeight: 0,
    opacity: 1,
    transitionProperty: 'opacity',
    transitionDuration: '360ms',
    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
      transitionDelay: '0ms',
    },
  },
  listBodyHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  listCompact: {
    flex: 1,
  },
  reading: {
    flex: 1,
  },
  // Buttons that bring the panes back. Fades in over the second half of the list closing.
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    width: '44px',
    paddingBlock: tokens.spacingVerticalS,
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: '180ms',
    transitionTimingFunction: 'ease',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
      transitionDelay: '0ms',
    },
  },
  railShown: {
    opacity: 1,
    pointerEvents: 'auto',
    transitionDelay: '180ms',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDelay: '0ms',
    },
  },
  // Applied until stored collapse flags have settled, so a reload does not replay the close.
  instant: {
    transitionDuration: '0.01ms',
    transitionDelay: '0ms',
  },
  selectionPane: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalS,
    height: '100%',
    padding: tokens.spacingHorizontalXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * The three-pane mail screen: folders | enquiry list | reading pane, collapsing on narrow screens.
 * Memoised, and given the search only once typing pauses, so keystrokes in the search box don't
 * re-render the whole screen.
 */
export const MailView = memo(function MailView({ search }: { search: string }) {
  const styles = useStyles();
  const mode = useLayoutMode();
  const { markRead } = useMailbox();

  const [view, setView] = useState<ViewId>('inbox');
  const [tab, setTab] = useState<ListTab>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Ticked enquiries for bulk actions (G-04.2), in the order they were ticked.
  const [checked, setChecked] = useState<string[]>([]);
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const anchor = useRef<string | null>(null);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [foldersHidden, setFoldersHidden] = useStoredFlag('mail.foldersHidden', false);
  const [listHidden, setListHidden] = useStoredFlag('mail.listHidden', false);
  // Off until the stored flags above have been applied, so a remembered collapse does not animate on load.
  const [motionReady, setMotionReady] = useState(false);
  const [newEnquiryOpen, setNewEnquiryOpen] = useState(false);
  const queryClient = useQueryClient();

  // A newly logged enquiry opens straight away, and lists/counts refresh to include it.
  const onEnquiryCreated = (ticket: TicketSummaryDto) => {
    setNewEnquiryOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.counts });
    setSelectedId(ticket.id);
    setShowReading(true);
  };
  // Phone layout shows one pane at a time.
  const [showReading, setShowReading] = useState(false);

  const readTicketNotifications = useReadTicketNotifications();

  // Two frames after the collapse flags settle (including the stored value) so that settled
  // layout paints once before transitions turn on. A click after that eases; a reload does not.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setMotionReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [foldersHidden, listHidden]);

  // Enquiries opened from the bell: `?open=` when arriving from another screen, or an event here.
  useEffect(() => {
    const open = (id: string) => {
      setChecked([]);
      anchor.current = id;
      setSelectedId(id);
      setShowReading(true);
    };
    const fromUrl = takeTicketFromUrl();
    if (fromUrl) open(fromUrl);
    const onOpen = (e: Event) => open((e as CustomEvent<string>).detail);
    window.addEventListener(OPEN_TICKET_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TICKET_EVENT, onOpen);
  }, []);

  const select = (ticket: TicketSummaryDto) => {
    setChecked([]);
    anchor.current = ticket.id;
    setSelectedId(ticket.id);
    readTicketNotifications(ticket.id);
    // Opening an enquiry marks it read, as in Outlook (not in Deleted items, which are read-only).
    if (ticket.isUnread && !ticket.deletedAt) markRead(ticket.id, true);
    setShowReading(true);
  };

  /** Click, Ctrl/Cmd-click (or tick box) and Shift-click in the list, as in Outlook. */
  const pick = (ticket: TicketSummaryDto, mode: PickMode, order: string[]) => {
    if (mode === 'open') return select(ticket);
    const from = order.indexOf(anchor.current ?? selectedId ?? '');
    if (mode === 'range' && from >= 0) {
      const to = order.indexOf(ticket.id);
      setChecked(order.slice(Math.min(from, to), Math.max(from, to) + 1));
      return;
    }
    // The first Ctrl-click keeps the open enquiry selected too.
    const base = checked.length ? checked : selectedId && order.includes(selectedId) ? [selectedId] : [];
    setChecked(base.includes(ticket.id) ? base.filter((id) => id !== ticket.id) : [...base, ticket.id]);
    anchor.current = ticket.id;
  };

  // A new search starts a new selection, like changing view or tab.
  useEffect(() => setChecked([]), [search]);

  const selectView = (next: ViewId) => {
    setChecked([]);
    setView(next);
    setSelectedId(null);
    setShowReading(false);
    setFoldersOpen(false);
  };

  const compact = mode === 'compact';
  // Either pane can be collapsed so the reading pane gets the room, as in Outlook; remembered per browser.
  const foldersInline = mode === 'wide' && !foldersHidden;
  // With the folders collapsed on a wide screen, "Show folders" brings the pane back; narrower screens use the drawer.
  const showFolders = mode === 'wide' ? () => setFoldersHidden(false) : () => setFoldersOpen(true);

  const folderPane = (
    <FolderPane
      view={view}
      onSelectView={selectView}
      onNewEnquiry={() => {
        setFoldersOpen(false);
        setNewEnquiryOpen(true);
      }}
      onCollapse={mode === 'wide' ? () => setFoldersHidden(true) : undefined}
    />
  );

  const list = (
    <MessageList
      view={view}
      tab={tab}
      onTabChange={(t) => {
        setTab(t);
        setSelectedId(null);
        setChecked([]);
      }}
      search={search}
      selectedId={selectedId}
      checkedIds={checkedSet}
      onPick={pick}
      onCheckAll={setChecked}
      onClearChecked={() => setChecked([])}
      onOpenFolders={foldersInline ? undefined : showFolders}
      onHideList={compact ? undefined : () => setListHidden(true)}
    />
  );

  return (
    <div className={styles.root}>
      {/* On phones the bar shows only while selecting (single enquiries use the reading pane's controls). */}
      {(!compact || checked.length > 0) && (
        <CommandBar ticketId={selectedId} selection={checked} onClearSelection={() => setChecked([])} />
      )}

      <div className={styles.panes}>
        {mode === 'wide' && (
          <div
            className={mergeClasses(
              styles.slot,
              styles.folderSlot,
              foldersHidden && styles.slotClosed,
              !motionReady && styles.instant,
            )}
          >
            <div className={styles.folderBody} aria-hidden={foldersHidden} inert={foldersHidden || undefined}>
              {folderPane}
            </div>
          </div>
        )}

        {!compact && (
          <div
            className={mergeClasses(
              styles.listColumn,
              listHidden && styles.listColumnClosed,
              !motionReady && styles.instant,
            )}
          >
            <nav
              className={mergeClasses(
                styles.card,
                styles.rail,
                listHidden && styles.railShown,
                !motionReady && styles.instant,
              )}
              aria-label="Collapsed panes"
              aria-hidden={!listHidden}
              inert={!listHidden || undefined}
            >
              {!foldersInline && (
                <Tooltip content="Show folders" relationship="label" positioning="after">
                  <Button appearance="subtle" icon={<NavigationRegular />} onClick={showFolders} />
                </Tooltip>
              )}
              <Tooltip content="Show enquiry list" relationship="label" positioning="after">
                <Button appearance="subtle" icon={<PanelLeftExpandRegular />} onClick={() => setListHidden(false)} />
              </Tooltip>
            </nav>
            <section
              className={mergeClasses(
                styles.card,
                styles.listBody,
                listHidden && styles.listBodyHidden,
                !motionReady && styles.instant,
              )}
              aria-label="Enquiry list"
              aria-hidden={listHidden}
              inert={listHidden || undefined}
            >
              {list}
            </section>
          </div>
        )}

        {compact && (!showReading || !selectedId) && (
          <section className={mergeClasses(styles.card, styles.listCompact)} aria-label="Enquiry list">
            {list}
          </section>
        )}

        {(!compact || (showReading && selectedId)) && (
          <section className={mergeClasses(styles.card, styles.reading)} aria-label="Reading pane">
            {checked.length > 0 ? (
              <div className={styles.selectionPane} role="status">
                <SelectAllOnRegular fontSize={48} />
                <Text weight="semibold" size={400}>
                  {checked.length} {checked.length === 1 ? 'enquiry' : 'enquiries'} selected
                </Text>
                <Text size={200}>Use the bar above to change them all at once.</Text>
                <Button size="small" onClick={() => setChecked([])}>
                  Clear selection
                </Button>
              </div>
            ) : (
              <ReadingPane
                key={selectedId ?? 'none'}
                ticketId={selectedId}
                onBack={compact ? () => setShowReading(false) : undefined}
                onClosed={() => {
                  setSelectedId(null);
                  setShowReading(false);
                }}
              />
            )}
          </section>
        )}
      </div>

      {mode !== 'wide' && (
        <OverlayDrawer open={foldersOpen} onOpenChange={(_, d) => setFoldersOpen(d.open)} position="start" size="small">
          <DrawerHeader>
            <DrawerHeaderTitle
              action={
                <Button
                  appearance="subtle"
                  aria-label="Close"
                  icon={<DismissRegular />}
                  onClick={() => setFoldersOpen(false)}
                />
              }
            >
              Folders
            </DrawerHeaderTitle>
          </DrawerHeader>
          <DrawerBody style={{ padding: 0 }}>{folderPane}</DrawerBody>
        </OverlayDrawer>
      )}

      <NewEnquiryDialog open={newEnquiryOpen} onOpenChange={setNewEnquiryOpen} onCreated={onEnquiryCreated} />
    </div>
  );
});
