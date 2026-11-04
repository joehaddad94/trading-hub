CREATE TABLE "backtest_replay_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"from_ts" timestamp with time zone NOT NULL,
	"to_ts" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backtest_replay_spans_order" CHECK ("backtest_replay_spans"."from_ts" <= "backtest_replay_spans"."to_ts")
);
--> statement-breakpoint
ALTER TABLE "backtest_replay_spans" ADD CONSTRAINT "backtest_replay_spans_session_id_backtest_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."backtest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backtest_replay_spans_session_id_to_ts_index" ON "backtest_replay_spans" USING btree ("session_id","to_ts");--> statement-breakpoint
-- Hand-written: RLS and updated_at, same pattern as the other backtest tables.
alter table public.backtest_replay_spans enable row level security;--> statement-breakpoint
revoke all on public.backtest_replay_spans from anon;--> statement-breakpoint
create policy owner_all on public.backtest_replay_spans for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.backtest_replay_spans for each row execute function public.set_updated_at();
