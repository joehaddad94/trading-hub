CREATE TYPE "public"."backtest_exit_reason" AS ENUM('tp', 'sl', 'breakeven', 'manual');--> statement-breakpoint
CREATE TYPE "public"."backtest_order_status" AS ENUM('pending', 'open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."backtest_order_type" AS ENUM('market', 'limit', 'stop');--> statement-breakpoint
CREATE TYPE "public"."backtest_session_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "backtest_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"drawing_id" uuid,
	"side" "trade_side" NOT NULL,
	"type" "backtest_order_type" NOT NULL,
	"status" "backtest_order_status" DEFAULT 'pending' NOT NULL,
	"lots" numeric(12, 2) NOT NULL,
	"entry" numeric(18, 5) NOT NULL,
	"sl" numeric(18, 5) NOT NULL,
	"tp" numeric(18, 5) NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"fill_price" numeric(18, 5),
	"filled_at" timestamp with time zone,
	"initial_sl" numeric(18, 5),
	"initial_tp" numeric(18, 5),
	"close_price" numeric(18, 5),
	"closed_at" timestamp with time zone,
	"exit_reason" "backtest_exit_reason",
	"ambiguous" boolean DEFAULT false NOT NULL,
	"modifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"processed_until" timestamp with time zone,
	"trade_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backtest_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"instrument_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"start_ts" timestamp with time zone,
	"end_ts" timestamp with time zone,
	"cursor_ts" timestamp with time zone,
	"starting_balance" numeric(14, 2) DEFAULT '25000' NOT NULL,
	"risk_pct" numeric(5, 2) DEFAULT '0.5' NOT NULL,
	"costs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"setup_tag_id" uuid,
	"notes" text,
	"status" "backtest_session_status" DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backtest_sessions_accountId_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_backtest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "backtest_orders" ADD CONSTRAINT "backtest_orders_session_id_backtest_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."backtest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_orders" ADD CONSTRAINT "backtest_orders_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_orders" ADD CONSTRAINT "backtest_orders_drawing_id_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_orders" ADD CONSTRAINT "backtest_orders_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_sessions" ADD CONSTRAINT "backtest_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_sessions" ADD CONSTRAINT "backtest_sessions_setup_tag_id_tags_id_fk" FOREIGN KEY ("setup_tag_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backtest_orders_session_id_status_index" ON "backtest_orders" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "backtest_sessions_status_index" ON "backtest_sessions" USING btree ("status");--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_session_id_backtest_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."backtest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-written: RLS, updated_at, backtest account guards, Backtest Lab firm.
alter table public.backtest_sessions enable row level security;--> statement-breakpoint
revoke all on public.backtest_sessions from anon;--> statement-breakpoint
create policy owner_all on public.backtest_sessions for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.backtest_sessions for each row execute function public.set_updated_at();--> statement-breakpoint
alter table public.backtest_orders enable row level security;--> statement-breakpoint
revoke all on public.backtest_orders from anon;--> statement-breakpoint
create policy owner_all on public.backtest_orders for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.backtest_orders for each row execute function public.set_updated_at();--> statement-breakpoint
-- Live accounts stay permanent; a backtest session's synthetic account goes with its session (spec §6.4).
drop trigger accounts_no_delete on public.accounts;--> statement-breakpoint
create trigger accounts_no_delete before delete on public.accounts
  for each row when (not old.is_backtest) execute function public.forbid_delete();--> statement-breakpoint
create or replace function public.forbid_backtest_flag_change() returns trigger
language plpgsql as $$
begin
  raise exception 'accounts.is_backtest cannot change'
    using errcode = 'restrict_violation';
end $$;--> statement-breakpoint
create trigger accounts_backtest_flag_immutable before update of is_backtest on public.accounts
  for each row when (old.is_backtest is distinct from new.is_backtest) execute function public.forbid_backtest_flag_change();--> statement-breakpoint
-- Backtest trades only on backtest accounts, live trades only on live accounts.
create or replace function public.check_trade_account_kind() returns trigger
language plpgsql as $$
begin
  if (new.source = 'backtest') is distinct from (select is_backtest from public.accounts where id = new.account_id) then
    raise exception 'trade source % does not match its account', new.source using errcode = 'check_violation';
  end if;
  return new;
end $$;--> statement-breakpoint
create trigger trades_account_kind before insert or update of account_id on public.trades
  for each row execute function public.check_trade_account_kind();--> statement-breakpoint
insert into public.firms (name) values ('Backtest Lab') on conflict (name) do nothing;
