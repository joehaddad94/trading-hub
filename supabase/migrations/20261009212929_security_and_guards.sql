-- Hand-written: RLS, owner check, live-data guards, updated_at triggers, journeys view, seed.
-- tech-architecture.md §5 and §11; CLAUDE.md rule 2.

-- updated_at ---------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'firms','accounts','account_status_history','cycles','balance_snapshots','rule_snapshots','symbol_specs',
    'trades','tags','journal_entries','screenshots','daily_notes','raw_imports','sync_health','alerts_log','cashflows'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Owner (single user) ------------------------------------------------------
-- The allowed email lives in the database too, so RLS doesn't depend on the app.
-- Set it once per environment: update private.app_config set allowed_email = '<email>';
create schema if not exists private;
revoke all on schema private from public;

create table private.app_config (
  id boolean primary key default true check (id),
  allowed_email text not null
);
insert into private.app_config (allowed_email) values ('owner@example.com');

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = (select lower(allowed_email) from private.app_config),
    false
  );
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

-- RLS: every table, owner only. Cron/import use the service role (bypasses RLS). --
do $$
declare t text;
begin
  foreach t in array array[
    'firms','accounts','account_status_history','cycles','balance_snapshots','rule_snapshots','symbol_specs',
    'trades','tags','journal_entries','trade_tags','screenshots','daily_notes','raw_imports','sync_health',
    'alerts_log','cashflows'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())',
      t
    );
  end loop;
end $$;

-- Live data is permanent (applies to every role, service role included) ----
create or replace function public.forbid_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'deleting % is not allowed: live data is permanent', tg_table_name
    using errcode = 'restrict_violation';
end $$;

create trigger accounts_no_delete before delete on public.accounts
  for each row execute function public.forbid_delete();

create trigger trades_no_live_delete before delete on public.trades
  for each row when (old.source = 'live') execute function public.forbid_delete();

create or replace function public.forbid_trade_source_change() returns trigger
language plpgsql as $$
begin
  raise exception 'trades.source cannot change (% -> %)', old.source, new.source
    using errcode = 'restrict_violation';
end $$;

create trigger trades_source_immutable before update of source on public.trades
  for each row when (old.source is distinct from new.source) execute function public.forbid_trade_source_change();

-- Journeys: P1 → P2 → Funded chains (tracker spec §5) -----------------------
create view public.account_journeys with (security_invoker = true) as
with recursive chain as (
  select id as account_id, id as root_account_id, 0 as depth
  from public.accounts where parent_account_id is null
  union all
  select a.id, c.root_account_id, c.depth + 1
  from public.accounts a join chain c on a.parent_account_id = c.account_id
)
select account_id, root_account_id, depth from chain;

-- Seed -----------------------------------------------------------------------
insert into public.firms (name) values ('FundedNext');
insert into public.sync_health (id) values (true);
