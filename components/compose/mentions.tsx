'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { ReactRenderer } from '@tiptap/react';
import Mention from '@tiptap/extension-mention';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { Avatar, makeStyles, mergeClasses, shorthands, Text, tokens } from '@fluentui/react-components';
import type { StaffDto } from '@/lib/shared';

// @mentions in internal notes: type "@" and a colleague's name to tell them about the enquiry
// without forwarding it. The note stores <span data-type="mention" data-id="<userId>">, which the
// API turns into a bell notification for that officer.

const MAX_SUGGESTIONS = 8;

const useStyles = makeStyles({
  list: {
    minWidth: '240px',
    maxWidth: '320px',
    paddingBlock: tokens.spacingVerticalXS,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    width: '100%',
    paddingBlock: tokens.spacingVerticalXS,
    paddingInline: tokens.spacingHorizontalS,
    textAlign: 'start',
    backgroundColor: 'transparent',
    ...shorthands.borderWidth(0),
    cursor: 'pointer',
    color: tokens.colorNeutralForeground1,
  },
  active: { backgroundColor: tokens.colorNeutralBackground1Selected },
  text: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  muted: { color: tokens.colorNeutralForeground3 },
  empty: { paddingBlock: tokens.spacingVerticalS, paddingInline: tokens.spacingHorizontalM },
});

type ListProps = SuggestionProps<StaffDto, { id: string; label: string }>;
interface ListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MentionList = forwardRef<ListHandle, ListProps>(function MentionList({ items, command }, ref) {
  const styles = useStyles();
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);

  const choose = (i: number) => {
    const o = items[i];
    if (o) command({ id: o.id, label: o.displayName });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') setActive((a) => (a + 1) % items.length);
      else if (event.key === 'ArrowUp') setActive((a) => (a - 1 + items.length) % items.length);
      else if (event.key === 'Enter' || event.key === 'Tab') choose(active);
      else return false;
      return true;
    },
  }));

  return (
    <div className={styles.list} role="listbox" aria-label="Mention a colleague">
      {items.length === 0 ? (
        <Text size={200} className={mergeClasses(styles.empty, styles.muted)} block>
          No colleague by that name
        </Text>
      ) : (
        items.map((o, i) => (
          <button
            key={o.id}
            type="button"
            role="option"
            aria-selected={i === active}
            className={mergeClasses(styles.item, i === active && styles.active)}
            // Keep focus in the editor so the mention lands where the officer was typing.
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(i)}
          >
            <Avatar name={o.displayName} size={24} color="colorful" />
            <span className={styles.text}>
              <Text size={300} truncate wrap={false}>
                {o.displayName}
              </Text>
              <Text size={100} className={styles.muted} truncate wrap={false}>
                {o.email}
              </Text>
            </span>
          </button>
        ))
      )}
    </div>
  );
});

/** Places the popup just under the "@…" being typed, kept on screen. */
function place(el: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return;
  const width = el.offsetWidth || 260;
  el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  const below = rect.bottom + 4;
  const height = el.offsetHeight || 200;
  el.style.top = `${below + height > window.innerHeight ? Math.max(8, rect.top - height - 4) : below}px`;
}

/**
 * The TipTap mention extension, suggesting active colleagues (not the author). `officers` is read
 * on each keystroke, so the list can arrive after the editor is created.
 */
export function noteMentions(officers: () => StaffDto[], myUserId: string) {
  return Mention.configure({
    HTMLAttributes: { class: 'mention' },
    suggestion: {
      char: '@',
      items: ({ query }) => {
        const q = query.trim().toLowerCase();
        return officers()
          .filter((o) => o.id !== myUserId)
          .filter((o) => !q || o.displayName.toLowerCase().includes(q) || o.email.toLowerCase().startsWith(q))
          .slice(0, MAX_SUGGESTIONS);
      },
      render: () => {
        let component: ReactRenderer<ListHandle, ListProps> | null = null;
        let popup: HTMLDivElement | null = null;
        const close = () => {
          popup?.remove();
          popup = null;
          component?.destroy();
          component = null;
        };
        return {
          onStart: (props) => {
            component = new ReactRenderer(MentionList, { props, editor: props.editor });
            popup = document.createElement('div');
            popup.style.position = 'fixed';
            popup.style.zIndex = '1000000';
            popup.appendChild(component.element);
            // Inside the Fluent provider, so the theme's colours and fonts apply.
            (props.editor.view.dom.closest('.fui-FluentProvider') ?? document.body).appendChild(popup);
            place(popup, props.clientRect?.());
          },
          onUpdate: (props) => {
            component?.updateProps(props);
            if (popup) place(popup, props.clientRect?.());
          },
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            if (event.key === 'Escape') {
              close();
              return true;
            }
            return component?.ref?.onKeyDown(event) ?? false;
          },
          onExit: close,
        };
      },
    },
  });
}
