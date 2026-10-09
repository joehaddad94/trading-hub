import Link from 'next/link';
import { ModuleHeader } from '@/shell/module-header';

export default function SettingsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ModuleHeader moduleId="settings" />
      <main className="flex flex-col gap-2 p-4 md:p-6">
        <h2 className="font-semibold text-xl">Settings</h2>
        <Link href="/settings/imports" className="text-sm underline-offset-4 hover:underline">
          Imports &amp; health
        </Link>
      </main>
    </div>
  );
}
