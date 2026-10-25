'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { Label, makeStyles, Tag, Text, tokens } from '@fluentui/react-components';
import type { EmailAddress } from '@/lib/shared';

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
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      commit(text);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(text)}
          onPaste={(e) => {
            e.preventDefault();
            commit(text + e.clipboardData.getData('text'));
          }}
        />
      </div>
      {error && (
        <Text size={200} className={styles.invalid} role="alert">
          {error}
        </Text>
      )}
    </div>
  );
}
