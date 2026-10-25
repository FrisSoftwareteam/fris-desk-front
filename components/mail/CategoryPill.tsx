'use client';

import { makeStyles, tokens } from '@fluentui/react-components';
import type { CategoryDto } from '@/lib/shared';

const useStyles = makeStyles({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '140px',
    height: '18px',
    paddingInline: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusSmall,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 0,
  },
  swatch: {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    borderRadius: tokens.borderRadiusSmall,
    flexShrink: 0,
  },
});

/**
 * Outlook-style category label: a light tint of the category colour with a darker shade for text,
 * derived from the stored hex so any admin-chosen colour stays legible.
 */
export function CategoryPill({ category }: { category: CategoryDto }) {
  const styles = useStyles();
  return (
    <span
      className={styles.pill}
      title={category.name}
      style={{
        backgroundColor: `color-mix(in srgb, ${category.color} 16%, white)`,
        color: `color-mix(in srgb, ${category.color} 72%, black)`,
      }}
    >
      {category.name}
    </span>
  );
}

/** The solid square used in the categories legend and pickers. */
export function CategorySwatch({ color }: { color: string }) {
  const styles = useStyles();
  return <span aria-hidden className={styles.swatch} style={{ backgroundColor: color }} />;
}
