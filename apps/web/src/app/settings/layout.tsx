import type { ReactNode } from 'react';
import { AppShell } from '@/shell/app-shell';

const NAV = [
  { href: '/settings' as const, label: 'General' },
  { href: '/settings/imports' as const, label: 'Imports & health' },
  { href: '/settings/users' as const, label: 'Users' },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell title="Settings" nav={NAV} rootHref="/settings">
      {children}
    </AppShell>
  );
}
