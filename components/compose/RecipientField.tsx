'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { Label, makeStyles, Tag, Text, tokens } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import type { EmailAddress } from '@/lib/shared';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

const EMAIL = /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/;

const useStyles = makeStyles({
  row: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    minHeight: '32px',
    paddingBlock: '2px',
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  label: {
    width: '52px',
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  input: {
    flex: 1,
    minWidth: '160px',
    border: 'none',
    outlineStyle: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    paddingBlock: '4px',
  },
  invalid: { color: tokens.colorPaletteRedForeground1 },
  anchor: { position: 'relative' },
  list: {
    position: 'absolute',
    zIndex: 10,
    left: '52px',
    right: 0,
    margin: 0,
    padding: `${tokens.spacingVerticalXS} 0`,
    listStyle: 'none',
    maxHeight: '260px',
    overflowY: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    cursor: 'pointer',
  },
  active: { backgroundColor: tokens.colorNeutralBackground1Hover },
  optionEmail: { color: tokens.colorNeutralForeground3 },
});

/** Outlook-style To/Cc line: each address becomes a removable chip; type, then Enter, comma or ; */
export function RecipientField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: EmailAddress[];
  onChange: (next: EmailAddress[]) => void;
  autoFocus?: boolean;
}) {
  const styles = useStyles();
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);

  const q = useDebouncedValue(text.trim(), 200);
  const found = useQuery({
    queryKey: ['directory', q],
    queryFn: () => api.directory(q),
    enabled: q.length >= 2 && !q.includes(',') && !q.includes(';'),
    staleTime: 60_000,
  });
  const suggestions =
    text.trim().length >= 2
      ? (found.data ?? []).filter((s) => !value.some((v) => v.email.toLowerCase() === s.email.toLowerCase()))
      : [];
  const showList = open && suggestions.length > 0;
  const listId = `${id}-suggestions`;

  const pick = (s: EmailAddress) => {
    onChange([...value, s]);
    setText('');
    setError(null);
    setActive(0);
  };

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const bad = parts.filter((p) => !EMAIL.test(p));
    const good = parts
      .filter((p) => EMAIL.test(p))
      .filter((p) => !value.some((v) => v.email.toLowerCase() === p.toLowerCase()))
      .map((email) => ({ name: '', email }));
    if (good.length) onChange([...value, ...good]);
    setText(bad.join(', '));
    setError(bad.length ? `Check ${bad.length === 1 ? 'this address' : 'these addresses'}: ${bad.join(', ')}` : null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showList) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((a) => (a + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[Math.min(active, suggestions.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      commit(text);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={styles.anchor}>
      <div className={styles.row}>
        <Label htmlFor={id} size="medium" className={styles.label}>
          {label}
        </Label>
        {value.map((r) => (
          <Tag
            key={r.email}
            size="small"
            shape="circular"
            dismissible
            dismissIcon={{ 'aria-label': `Remove ${r.email}` }}
            title={r.email}
            onClick={() => onChange(value.filter((v) => v.email !== r.email))}
          >
            {r.name || r.email}
          </Tag>
        ))}
        <input
          id={id}
          className={styles.input}
          value={text}
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            commit(text);
          }}
          onPaste={(e) => {
            e.preventDefault();
            commit(text + e.clipboardData.getData('text'));
          }}
        />
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className={styles.list}>
          {suggestions.map((s, i) => (
            <li
              key={s.email}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? `${styles.option} ${styles.active}` : styles.option}
              // Keep focus in the input so its blur doesn't commit the half-typed text first.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(s)}
            >
              <Text weight="semibold">{s.name || s.email}</Text>
              {s.name && (
                <Text size={200} className={styles.optionEmail}>
                  {s.email}
                </Text>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <Text size={200} className={styles.invalid} role="alert">
          {error}
        </Text>
      )}
    </div>
  );
}
