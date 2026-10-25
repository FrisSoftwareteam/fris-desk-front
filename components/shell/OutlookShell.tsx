'use client';

import type { ReactElement, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Badge,
  Button,
  makeStyles,
  Menu,
  MenuDivider,
  MenuGroup,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  mergeClasses,
  SearchBox,
  Text,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import {
  DataBarVerticalRegular,
  MailInboxRegular,
  QuestionCircleRegular,
  SettingsRegular,
  SignOutRegular,
} from '@fluentui/react-icons';
import { useCurrentUser, useSignOut } from '@/components/auth/CurrentUser';
import { CompanyLogo } from '@/components/brand/CompanyLogo';
import { NotificationBell } from '@/components/notifications/NotificationBell';

const ROLE_LABEL = { agent: 'Agent', supervisor: 'Supervisor', admin: 'Admin' } as const;
const LATER = 'coming in a later build phase';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateRows: '64px 1fr',
    gridTemplateColumns: '48px 1fr',
    gridTemplateAreas: '"top top" "rail main"',
    height: '100dvh',
    backgroundColor: tokens.colorNeutralBackground3,
    '@media (max-width: 767px)': {
      gridTemplateColumns: '1fr',
      gridTemplateAreas: '"top" "main"',
    },
  },
  top: {
    gridArea: 'top',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingInline: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    height: '48px',
  },
  logo: {
    display: 'block',
    height: '40px',
    width: 'auto',
    filter: 'brightness(0) invert(1)',
  },
  searchWrap: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    minWidth: 0,
  },
  search: {
    width: '100%',
    maxWidth: '560px',
  },
  topActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
  onBrandButton: {
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': { color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorBrandBackgroundHover },
    ':hover:active': {
      color: tokens.colorNeutralForegroundOnBrand,
      backgroundColor: tokens.colorBrandBackgroundPressed,
    },
    '@media (max-width: 767px)': { display: 'none' },
  },
  avatarButton: {
    minWidth: 'auto',
    padding: '2px',
    borderRadius: tokens.borderRadiusCircular,
  },
  rail: {
    gridArea: 'rail',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
    '@media (max-width: 767px)': { display: 'none' },
  },
  railButton: {
    width: '40px',
    height: '40px',
  },
  railActive: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  main: {
    gridArea: 'main',
    minWidth: 0,
    minHeight: 0,
  },
});

/** The app open in the rail, like Outlook's Mail / Calendar switcher. */
export type ShellApp = 'mail' | 'dashboard' | 'admin';

const APP_PATH: Record<ShellApp, string> = { mail: '/', dashboard: '/dashboard', admin: '/admin' };

interface OutlookShellProps {
  app?: ShellApp;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  children: ReactNode;
}

/** App chrome in the style of Outlook on the web: brand top bar, app rail, then the page content. */
export function OutlookShell({ app = 'mail', search, children }: OutlookShellProps) {
  const styles = useStyles();
  const user = useCurrentUser();
  const signOut = useSignOut();
  const router = useRouter();
  // Supervisors manage templates and can read rules and SLA policies; admins manage everything.
  const canAdmin = user.role === 'admin' || user.role === 'supervisor';

  const railButton = (target: ShellApp, label: string, icon: ReactElement) => (
    <Tooltip content={label} relationship="label" positioning="after">
      <Button
        appearance="subtle"
        className={mergeClasses(styles.railButton, app === target && styles.railActive)}
        icon={icon}
        aria-current={app === target ? 'page' : undefined}
        onClick={() => app !== target && router.push(APP_PATH[target])}
      />
    </Tooltip>
  );

  return (
    <div className={styles.root}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <CompanyLogo className={styles.logo} />
        </div>

        <div className={styles.searchWrap} role="search">
          {search && (
            <SearchBox
              className={styles.search}
              size="medium"
              appearance="filled-lighter"
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              value={search.value}
              onChange={(_, d) => search.onChange(d.value)}
            />
          )}
        </div>

        <div className={styles.topActions}>
          {user.role === 'admin' && (
            <Tooltip content="Settings" relationship="label">
              <Button
                appearance="transparent"
                icon={<SettingsRegular />}
                className={styles.onBrandButton}
                onClick={() => router.push('/admin?section=settings')}
              />
            </Tooltip>
          )}
          <NotificationBell />
          <Tooltip content={`Help (${LATER})`} relationship="label">
            <Button
              appearance="transparent"
              icon={<QuestionCircleRegular />}
              className={styles.onBrandButton}
              disabledFocusable
            />
          </Tooltip>
          <Menu positioning="below-end">
            <MenuTrigger disableButtonEnhancement>
              <Button
                appearance="transparent"
                className={styles.avatarButton}
                aria-label={`Account: ${user.displayName}`}
              >
                <Avatar name={user.displayName} size={32} color="colorful" />
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <div className="flex items-center gap-3 px-3 py-2">
                <Avatar name={user.displayName} size={40} color="colorful" />
                <div className="flex min-w-0 flex-col">
                  <Text weight="semibold">{user.displayName}</Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {user.email}
                  </Text>
                  <span className="mt-1">
                    <Badge appearance="tint" size="small">
                      {ROLE_LABEL[user.role]}
                    </Badge>
                  </span>
                </div>
              </div>
              <MenuDivider />
              <MenuList>
                <MenuGroup>
                  {app !== 'mail' && (
                    <MenuItem icon={<MailInboxRegular />} onClick={() => router.push('/')}>
                      Enquiries
                    </MenuItem>
                  )}
                  {app !== 'dashboard' && (
                    <MenuItem icon={<DataBarVerticalRegular />} onClick={() => router.push('/dashboard')}>
                      Dashboard
                    </MenuItem>
                  )}
                  {canAdmin && app !== 'admin' && (
                    <MenuItem icon={<SettingsRegular />} onClick={() => router.push('/admin')}>
                      Admin
                    </MenuItem>
                  )}
                </MenuGroup>
                <MenuDivider />
                <MenuGroup>
                  <MenuItem icon={<SignOutRegular />} onClick={() => void signOut()}>
                    Sign out
                  </MenuItem>
                </MenuGroup>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      </header>

      <nav className={styles.rail} aria-label="Apps">
        {railButton('mail', 'Enquiries', <MailInboxRegular fontSize={22} />)}
        {railButton('dashboard', 'Dashboard', <DataBarVerticalRegular fontSize={22} />)}
        {canAdmin && railButton('admin', 'Admin', <SettingsRegular fontSize={22} />)}
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
