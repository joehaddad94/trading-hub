import Link from 'next/link';
import { ImportOnOpen } from '@/shell/import-on-open';
import { ModuleHeader } from '@/shell/module-header';
import { SyncBanner } from '@/shell/sync-banner';

export default function SettingsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ModuleHeader moduleId="settings" />
      <SyncBanner />
      <ImportOnOpen />
      <main className="flex flex-col gap-2 p-4 md:p-6">
        <h2 className="font-semibold text-xl">Settings</h2>
        <Link href="/settings/imports" className="text-sm underline-offset-4 hover:underline">
          Imports &amp; health
        </Link>
      </main>
    </div>
  );
}
