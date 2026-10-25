'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Dropdown, makeStyles, mergeClasses, Option, shorthands, Text, tokens } from '@fluentui/react-components';
import {
  ArrowRoutingRegular,
  CheckmarkCircleRegular,
  DocumentTextRegular,
  FolderRegular,
  PeopleRegular,
  PeopleTeamRegular,
  SettingsRegular,
  StatusRegular,
  TagRegular,
  TimerRegular,
} from '@fluentui/react-icons';
import type { Role } from '@/lib/shared';
import { useCurrentUser } from '@/components/auth/CurrentUser';
import { CategoriesAdmin, FoldersAdmin } from './FoldersAdmin';
import { RulesAdmin, SlaAdmin } from './AutomationAdmin';
import { DepartmentsAdmin, UsersAdmin } from './PeopleAdmin';
import { SettingsAdmin } from './SettingsAdmin';
import { StatusReasonsAdmin } from './StatusReasonsAdmin';
import { TemplatesAdmin } from './TemplatesAdmin';
import { ApprovalsAdmin } from './ApprovalsAdmin';

// Admin area (BUILD_SPEC §8.4): every runtime input entered in the app UI. Laid out like Outlook's
// settings: sections on the left, the chosen one on the right. Admins see everything; supervisors
// manage templates and approvals, and can look at (not change) rules and SLA policies — the API
// enforces the same.

type SectionId =
  | 'folders'
  | 'categories'
  | 'statuses'
  | 'rules'
  | 'sla'
  | 'templates'
  | 'approvals'
  | 'departments'
  | 'users'
  | 'settings';

interface Section {
  id: SectionId;
  label: string;
  icon: ReactNode;
  /** Who can open it; `readOnlyFor` see it without edit controls. */
  roles: Role[];
  readOnlyFor?: Role[];
  render: (readOnly: boolean) => ReactNode;
}

const SECTIONS: Section[] = [
  { id: 'folders', label: 'Folders', icon: <FolderRegular />, roles: ['admin'], render: () => <FoldersAdmin /> },
  { id: 'categories', label: 'Categories', icon: <TagRegular />, roles: ['admin'], render: () => <CategoriesAdmin /> },
  {
    id: 'statuses',
    label: 'Statuses',
    icon: <StatusRegular />,
    roles: ['admin'],
    render: () => <StatusReasonsAdmin />,
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: <ArrowRoutingRegular />,
    roles: ['admin', 'supervisor'],
    readOnlyFor: ['supervisor'],
    render: (ro) => <RulesAdmin readOnly={ro} />,
  },
  {
    id: 'sla',
    label: 'SLA',
    icon: <TimerRegular />,
    roles: ['admin', 'supervisor'],
    readOnlyFor: ['supervisor'],
    render: (ro) => <SlaAdmin readOnly={ro} />,
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: <DocumentTextRegular />,
    roles: ['admin', 'supervisor'],
    render: () => <TemplatesAdmin />,
  },
  {
    id: 'approvals',
    label: 'Approvals',
    icon: <CheckmarkCircleRegular />,
    roles: ['admin', 'supervisor'],
    render: () => <ApprovalsAdmin />,
  },
  {
    id: 'departments',
    label: 'Departments',
    icon: <PeopleTeamRegular />,
    roles: ['admin'],
    render: () => <DepartmentsAdmin />,
  },
  { id: 'users', label: 'Users', icon: <PeopleRegular />, roles: ['admin'], render: () => <UsersAdmin /> },
  { id: 'settings', label: 'Settings', icon: <SettingsRegular />, roles: ['admin'], render: () => <SettingsAdmin /> },
];

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: '220px 1fr',
    height: '100%',
    minHeight: 0,
    '@media (max-width: 767px)': { gridTemplateColumns: '1fr', gridTemplateRows: 'auto 1fr' },
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground3,
    '@media (max-width: 767px)': { display: 'none' },
  },
  navTitle: {
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    height: '36px',
    paddingInline: tokens.spacingHorizontalM,
    ...shorthands.borderStyle('none'),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    textAlign: 'left',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground3Hover },
    ':focus-visible': {
      outlineWidth: tokens.strokeWidthThick,
      outlineStyle: 'solid',
      outlineColor: tokens.colorStrokeFocus2,
      outlineOffset: '-2px',
    },
  },
  navActive: {
    backgroundColor: tokens.colorNeutralBackground1,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1 },
  },
  mobileNav: {
    display: 'none',
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground3,
    '@media (max-width: 767px)': { display: 'block' },
  },
  content: {
    minWidth: 0,
    overflowY: 'auto',
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL} ${tokens.spacingVerticalXXXL}`,
    backgroundColor: tokens.colorNeutralBackground2,
    '@media (max-width: 767px)': { padding: tokens.spacingHorizontalM },
  },
});

export function AdminView() {
  const styles = useStyles();
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const visible = SECTIONS.filter((s) => s.roles.includes(user.role));
  if (visible.length === 0) {
    return (
      <div className={styles.content}>
        <Text>Only supervisors and admins can open Admin.</Text>
      </div>
    );
  }
  const current = visible.find((s) => s.id === params.get('section')) ?? visible[0]!;
  const open = (id: SectionId) => router.replace(`${pathname}?section=${id}`, { scroll: false });

  return (
    <div className={styles.root}>
      <nav className={styles.nav} aria-label="Admin sections">
        <Text weight="semibold" size={400} className={styles.navTitle}>
          Admin
        </Text>
        {visible.map((s) => (
          <button
            key={s.id}
            type="button"
            className={mergeClasses(styles.navItem, s.id === current.id && styles.navActive)}
            aria-current={s.id === current.id ? 'page' : undefined}
            onClick={() => open(s.id)}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>
      <div className={styles.mobileNav}>
        <Dropdown
          aria-label="Admin section"
          value={current.label}
          selectedOptions={[current.id]}
          onOptionSelect={(_, d) => open(d.optionValue as SectionId)}
          style={{ width: '100%' }}
        >
          {visible.map((s) => (
            <Option key={s.id} value={s.id}>
              {s.label}
            </Option>
          ))}
        </Dropdown>
      </div>
      <section className={styles.content} aria-label={current.label}>
        {current.render(Boolean(current.readOnlyFor?.includes(user.role)))}
      </section>
    </div>
  );
}
