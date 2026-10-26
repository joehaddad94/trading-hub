import type { SessionView } from '@trading/backtest';
import Decimal from 'decimal.js';
import { ActionForm } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/lib/action-result';
import { formatBeirut } from '@/lib/format';

type Action = (prev: ActionResult<string> | null, form: FormData) => Promise<ActionResult<string>>;

const select = 'h-11 rounded-md border bg-background px-2 text-base md:h-9 md:text-sm';

/**
 * New / edit session (backtester spec §7): name, balance, risk per trade, setup tag, notes and per-instrument
 * costs.
 * Costs start at the instrument's defaults (FundedNext's spread, no commission or slippage).
 */
export function SessionForm({
  action,
  submit,
  label,
  session,
  tags,
  instruments,
  idPrefix,
}: {
  action: Action;
  submit: string;
  label: string;
  session?: SessionView;
  /** Null hides the Setup field (invited users). */
  tags: { id: string; name: string }[] | null;
  instruments: { code: string; defaultSpreadPoints: string }[];
  idPrefix: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <ActionForm action={action} submit={submit} label={label}>
      {session && <input type="hidden" name="id" value={session.id} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-1">
          <Label htmlFor={id('name')}>Name</Label>
          <Input
            id={id('name')}
            name="name"
            required
            maxLength={80}
            defaultValue={session?.name ?? `Run · ${formatBeirut(new Date(), 'd MMM yyyy')}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={id('balance')}>Starting balance $</Label>
          <Input
            id={id('balance')}
            name="startingBalance"
            inputMode="decimal"
            defaultValue={session ? Number(session.startingBalance).toString() : '25000'}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={id('risk')}>Risk per trade %</Label>
          <Input
            id={id('risk')}
            name="riskPct"
            inputMode="decimal"
            defaultValue={session ? Number(session.riskPct).toString() : '0.5'}
          />
        </div>
        {tags && (
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor={id('tag')}>Setup</Label>
            <select id={id('tag')} name="setupTagId" defaultValue={session?.setupTagId ?? ''} className={select}>
              <option value="">No setup tag</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="col-span-2 flex flex-col gap-1">
          <Label htmlFor={id('notes')}>Notes</Label>
          <Input id={id('notes')} name="notes" maxLength={2000} defaultValue={session?.notes ?? ''} />
        </div>
      </div>
      {/* Costs default to FundedNext's, so they stay folded unless this session changed them (audit U9). */}
      <details className="group" open={customCosts(session, instruments)}>
        <summary className="flex h-11 cursor-pointer items-center text-muted-foreground text-sm md:h-9">
          Advanced: costs per instrument
        </summary>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-muted-foreground text-xs">Costs (spread and slippage in points)</legend>
          {instruments.map((i) => {
            const own = session?.costs[i.code];
            return (
              <div key={i.code} className="grid grid-cols-[4rem_1fr_1fr_1fr] items-end gap-2">
                <span className="pb-2 font-medium text-sm">{i.code}</span>
                <CostInput
                  id={id(`${i.code}-spread`)}
                  name={`cost_${i.code}_spread`}
                  label="Spread"
                  value={own?.spreadPoints ?? Number(i.defaultSpreadPoints).toString()}
                />
                <CostInput
                  id={id(`${i.code}-commission`)}
                  name={`cost_${i.code}_commission`}
                  label="Commission $/lot"
                  value={own?.commissionPerLot ?? '0'}
                />
                <CostInput
                  id={id(`${i.code}-slippage`)}
                  name={`cost_${i.code}_slippage`}
                  label="Slippage"
                  value={own?.slippagePoints ?? '0'}
                />
              </div>
            );
          })}
        </fieldset>
      </details>
    </ActionForm>
  );
}

/** True when an edited session's costs differ from the instrument defaults. */
function customCosts(session: SessionView | undefined, instruments: { code: string; defaultSpreadPoints: string }[]) {
  if (!session) return false;
  return instruments.some((i) => {
    const own = session.costs[i.code];
    if (!own) return false;
    return (
      !new Decimal(own.spreadPoints).eq(i.defaultSpreadPoints) ||
      !new Decimal(own.commissionPerLot).isZero() ||
      !new Decimal(own.slippagePoints).isZero()
    );
  });
}

function CostInput(props: { id: string; name: string; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={props.id} className="text-xs">
        {props.label}
      </Label>
      <Input id={props.id} name={props.name} inputMode="decimal" defaultValue={props.value} />
    </div>
  );
}
