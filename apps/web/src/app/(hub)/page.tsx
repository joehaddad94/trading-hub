import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ImportOnOpen } from '@/shell/import-on-open';
import { MODULES } from '@/shell/modules';

/** Tracker spec §8.0 hub. Live summaries arrive with M6. */
export default function HubPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-8">
      <ImportOnOpen />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Trading Hub</h1>
          <p className="text-muted-foreground text-sm">Sync status appears here once imports run.</p>
        </div>
        <Link href="/settings" className="text-muted-foreground text-sm hover:text-foreground">
          Settings
        </Link>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {MODULES.map((m) => (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle>{m.name}</CardTitle>
              <CardDescription>{m.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              {m.id === 'backtest' ? <span className="md:hidden">Best on desktop.</span> : <span>No data yet.</span>}
            </CardContent>
            <CardFooter className="mt-auto">
              <Button asChild className="w-full">
                <Link href={m.href}>Open {m.name}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </main>
  );
}
