import { ActionForm } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getNewsSettingsOrDefault } from '@/modules/news/server/news';
import { saveNewsRulesAction } from './actions';

/** Restriction rules (news spec §5): the window around restricted events and which currencies count. */
export default async function RulesPage() {
  const s = await getNewsSettingsOrDefault();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Restriction rules</h2>
      <section className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
        <h3 className="font-medium">FundedNext news rule</h3>
        <p>
          On a funded FundedNext account, a trade opened or closed within the window around a listed high-impact event
          only counts 40% of its profit. It does not apply to challenge phases (P1, P2), and the News Trading add-on
          removes it. Only events that move the traded instrument count: for US30 and NAS100 that is USD.
        </p>
        <p className="text-muted-foreground text-xs">
          Checked against FundedNext&apos;s help centre on 9 Oct 2026. FundedNext flags each restricted event (🔒); the
          window length and currencies below are settings, not hard-coded, in case the rule changes.
        </p>
      </section>
      <section className="rounded-lg border p-4">
        <ActionForm action={saveNewsRulesAction} submit="Save" label="Restriction window">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="before">Minutes before</Label>
              <Input id="before" name="minutesBefore" inputMode="numeric" defaultValue={s.minutesBefore} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="after">Minutes after</Label>
              <Input id="after" name="minutesAfter" inputMode="numeric" defaultValue={s.minutesAfter} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="currencies">Currencies that count</Label>
            <Input id="currencies" name="currencies" defaultValue={s.currencies.join(', ')} />
            <p className="text-muted-foreground text-xs">
              Also the default currency filter on the News pages and the hub card.
            </p>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
