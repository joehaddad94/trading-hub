CREATE TYPE "public"."ingest_status" AS ENUM('ok', 'gaps', 'empty', 'failed');--> statement-breakpoint
CREATE TABLE "candles_1m" (
	"instrument_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"open" numeric(18, 5) NOT NULL,
	"high" numeric(18, 5) NOT NULL,
	"low" numeric(18, 5) NOT NULL,
	"close" numeric(18, 5) NOT NULL,
	"volume" numeric(20, 4),
	CONSTRAINT "candles_1m_instrument_id_ts_pk" PRIMARY KEY("instrument_id","ts"),
	CONSTRAINT "candles_1m_minute_aligned" CHECK (date_trunc('minute', "candles_1m"."ts") = "candles_1m"."ts"),
	CONSTRAINT "candles_1m_ohlc" CHECK ("candles_1m"."high" >= greatest("candles_1m"."open", "candles_1m"."close", "candles_1m"."low") and "candles_1m"."low" <= least("candles_1m"."open", "candles_1m"."close"))
);
--> statement-breakpoint
CREATE TABLE "data_ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"from_ts" timestamp with time zone NOT NULL,
	"to_ts" timestamp with time zone NOT NULL,
	"rows_inserted" integer DEFAULT 0 NOT NULL,
	"status" "ingest_status" NOT NULL,
	"error" text,
	"gaps" jsonb,
	"trigger" text DEFAULT 'cron' NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"provider" text DEFAULT 'dukascopy' NOT NULL,
	"provider_code" text NOT NULL,
	"display_name" text NOT NULL,
	"firm_symbol" text,
	"point_value_per_lot" numeric(12, 4) NOT NULL,
	"price_digits" integer NOT NULL,
	"default_spread_points" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "candles_1m" ADD CONSTRAINT "candles_1m_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_ingest_runs" ADD CONSTRAINT "data_ingest_runs_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_ingest_runs_instrument_id_from_ts_index" ON "data_ingest_runs" USING btree ("instrument_id","from_ts");--> statement-breakpoint
CREATE INDEX "data_ingest_runs_ran_at_index" ON "data_ingest_runs" USING btree ("ran_at");--> statement-breakpoint
-- Hand-written: RLS, updated_at, seed instruments (backtester spec §1.2; codes verified in dukascopy-node 1.50.0).
alter table public.instruments enable row level security;--> statement-breakpoint
revoke all on public.instruments from anon;--> statement-breakpoint
create policy owner_all on public.instruments for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.instruments for each row execute function public.set_updated_at();--> statement-breakpoint
alter table public.candles_1m enable row level security;--> statement-breakpoint
revoke all on public.candles_1m from anon;--> statement-breakpoint
create policy owner_all on public.candles_1m for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
alter table public.data_ingest_runs enable row level security;--> statement-breakpoint
revoke all on public.data_ingest_runs from anon;--> statement-breakpoint
create policy owner_all on public.data_ingest_runs for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.data_ingest_runs for each row execute function public.set_updated_at();--> statement-breakpoint
insert into public.instruments (code, provider, provider_code, display_name, firm_symbol, point_value_per_lot, price_digits, default_spread_points) values
  ('US30', 'dukascopy', 'usa30idxusd', 'US30 · Dow Jones', 'US30', 10, 2, 2.00),
  ('NAS100', 'dukascopy', 'usatechidxusd', 'NAS100 · Nasdaq 100', 'NDX100', 10, 2, 1.50)
on conflict (code) do nothing;
