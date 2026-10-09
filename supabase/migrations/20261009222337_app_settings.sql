CREATE TABLE "app_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"day_time_zone" text DEFAULT 'Asia/Beirut' NOT NULL,
	"day_rollover_hour" integer DEFAULT 0 NOT NULL,
	"scratch_threshold_r" numeric(6, 3) DEFAULT '0.1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id"),
	CONSTRAINT "app_settings_rollover_hour" CHECK ("app_settings"."day_rollover_hour" between 0 and 23),
	CONSTRAINT "app_settings_scratch" CHECK ("app_settings"."scratch_threshold_r" >= 0 and "app_settings"."scratch_threshold_r" < 1)
);
--> statement-breakpoint
-- Hand-written: RLS, updated_at and the single row (same pattern as security_and_guards).
alter table public.app_settings enable row level security;--> statement-breakpoint
revoke all on public.app_settings from anon;--> statement-breakpoint
create policy owner_all on public.app_settings for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.app_settings for each row execute function public.set_updated_at();--> statement-breakpoint
insert into public.app_settings (id) values (true);
