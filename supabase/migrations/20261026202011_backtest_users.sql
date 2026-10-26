CREATE TABLE "backtest_users" (
	"email" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backtest_users_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "backtest_users_email_lower" CHECK ("backtest_users"."email" = lower("backtest_users"."email"))
);
--> statement-breakpoint
CREATE TABLE "sign_in_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backtest_sessions" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
CREATE INDEX "sign_in_failures_ip_at_index" ON "sign_in_failures" USING btree ("ip","at");--> statement-breakpoint
CREATE INDEX "backtest_sessions_owner_id_index" ON "backtest_sessions" USING btree ("owner_id");--> statement-breakpoint
-- Hand-written: RLS (owner only, like every table; the app reaches these through the server's DB connection),
-- updated_at. Invited users get no Supabase API access to any table.
alter table public.backtest_users enable row level security;--> statement-breakpoint
revoke all on public.backtest_users from anon;--> statement-breakpoint
create policy owner_all on public.backtest_users for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.backtest_users for each row execute function public.set_updated_at();--> statement-breakpoint
alter table public.sign_in_failures enable row level security;--> statement-breakpoint
revoke all on public.sign_in_failures from anon, authenticated;
