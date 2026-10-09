import { DAY_PRESETS } from '@trading/tracker/server';
import Link from 'next/link';
import { connection } from 'next/server';
import { ActionForm } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountLabel } from '@/modules/tracker/scope-label';
import { getSettings } from '@/modules/tracker/server/settings';
import { listAccountRisk, listSymbolSpecs } from '@/modules/tracker/server/settings-admin';
import { ImportOnOpen } from '@/shell/import-on-open';
import { ModuleHeader } from '@/shell/module-header';
import { SyncBanner } from '@/shell/sync-banner';
import { saveAccountRiskAction, saveGeneralSettings, saveSymbolSpecAction } from './actions';

/** Settings (§8.3 screen 12): day boundary, scratch threshold, symbol point values, default risk per account. */
export default async function SettingsPage() {
  await connection();
  const [settings, specs, risks] = await Promise.all([getSettings(), listSymbolSpecs(), listAccountRisk()]);
  return (
    <div className="flex min-h-dvh flex-col">
      <ModuleHeader moduleId="settings" />
      <SyncBanner />
      <ImportOnOpen />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-xl">Settings</h2>
          <Link href="/settings/imports" className="text-sm underline-offset-4 hover:underline">
            Imports &amp; health
          </Link>
        </div>

        <section className="rounded-lg border p-4">
          <h3 className="mb-3 font-medium">Days and scratches</h3>
          <ActionForm action={saveGeneralSettings} submit="Save" label="Days and scratches">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm">A trading day ends at</legend>
              {Object.entries(DAY_PRESETS).map(([key, preset]) => (
                <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="radio" name="dayPreset" value={key} defaultChecked={settings.dayPreset === key} />
                  {preset.label}
                </label>
              ))}
            </fieldset>
            <div className="flex max-w-xs flex-col gap-1">
              <Label htmlFor="scratch">Scratch threshold (R)</Label>
              <Input
                id="scratch"
                name="scratchThresholdR"
                inputMode="decimal"
                defaultValue={String(settings.scratchThresholdR)}
              />
              <p className="text-muted-foreground text-xs">
                Trades with |R| below this count as scratches, not wins or losses.
              </p>
            </div>
          </ActionForm>
        </section>

        <section className="rounded-lg border p-4" aria-labelledby="symbols">
          <h3 id="symbols" className="mb-1 font-medium">
            Symbol point values
          </h3>
          <p className="mb-3 text-muted-foreground text-xs">
            $ per 1.00 point per 1 lot. Learned from your trades on import; change one only if the firm changes contract
            size. Used to turn a journaled stop into risk.
          </p>
          {specs.length === 0 ? (
            <p className="text-sm">None yet. They are learned on the first import.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {specs.map((s) => (
                <li key={s.id}>
                  <ActionForm
                    action={saveSymbolSpecAction}
                    submit="Save"
                    label={`${s.symbol} point value`}
                    className="gap-2"
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`pv-${s.id}`}>
                          {s.symbol} · {s.firm}
                        </Label>
                        <Input
                          id={`pv-${s.id}`}
                          name="pointValuePerLot"
                          inputMode="decimal"
                          defaultValue={s.pointValuePerLot}
                          className="w-32"
                        />
                      </div>
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" name="verified" defaultChecked={s.verified} /> Verified
                      </label>
                    </div>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border p-4" aria-labelledby="risk">
          <h3 id="risk" className="mb-1 font-medium">
            Default risk per trade
          </h3>
          <p className="mb-3 text-muted-foreground text-xs">
            % of starting balance, used to estimate risk when nothing better is known (shown with an “est.” badge).
          </p>
          <ul className="flex flex-col gap-3">
            {risks.map((r) => (
              <li key={r.id}>
                <ActionForm
                  action={saveAccountRiskAction}
                  submit="Save"
                  label={`${r.login} default risk`}
                  className="gap-2"
                >
                  <input type="hidden" name="id" value={r.id} />
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`risk-${r.id}`}>{accountLabel(r)}</Label>
                    <Input
                      id={`risk-${r.id}`}
                      name="defaultRiskPct"
                      inputMode="decimal"
                      defaultValue={r.defaultRiskPct}
                      className="w-32"
                    />
                  </div>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
