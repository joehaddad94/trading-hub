import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { DialogProvider } from '@/components/dialogs';
import { THEME_COLOR, THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'Trading Hub',
  description: 'Personal trading tracker, news calendar and replay backtester',
};

export const viewport: Viewport = {
  // Before the theme script runs (and with JS off) the browser picks by OS setting; the script then pins it.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script changes <html>'s class and style before hydration, so React must not complain about them.
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Blocking on purpose: sets light/dark before first paint, so there is no flash of the wrong theme. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script from lib/theme.ts, no user input. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <NuqsAdapter>
          <DialogProvider>{children}</DialogProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
