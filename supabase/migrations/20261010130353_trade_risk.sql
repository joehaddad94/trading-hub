CREATE TABLE "trade_risk" (
	"trade_id" uuid PRIMARY KEY NOT NULL,
	"risk_usd" numeric(14, 2) NOT NULL,
	"risk_pct" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_risk_positive" CHECK ("trade_risk"."risk_usd" > 0)
);
--> statement-breakpoint
ALTER TABLE "trade_risk" ADD CONSTRAINT "trade_risk_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-written: RLS and updated_at (same pattern as security_and_guards).
alter table public.trade_risk enable row level security;--> statement-breakpoint
revoke all on public.trade_risk from anon;--> statement-breakpoint
create policy owner_all on public.trade_risk for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.trade_risk for each row execute function public.set_updated_at();
