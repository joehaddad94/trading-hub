CREATE TYPE "public"."event_impact" AS ENUM('high', 'medium', 'low', 'holiday');--> statement-breakpoint
CREATE TABLE "economic_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'fundednext' NOT NULL,
	"external_id" integer NOT NULL,
	"title" text NOT NULL,
	"currency" text NOT NULL,
	"impact" "event_impact" NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"forecast" text,
	"previous" text,
	"actual" text,
	"is_restricted" boolean DEFAULT false NOT NULL,
	"restriction_label" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"superseded_by" uuid,
	"cancelled_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "news_minutes_before" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "news_minutes_after" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "news_currencies" text[] DEFAULT '{USD}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "economic_events" ADD CONSTRAINT "economic_events_superseded_by_economic_events_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."economic_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "economic_events_source_external_id_index" ON "economic_events" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "economic_events_visible_at" ON "economic_events" USING btree ("event_at") WHERE "economic_events"."superseded_by" is null and "economic_events"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "economic_events_currency_event_at_index" ON "economic_events" USING btree ("currency","event_at");--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_news_window" CHECK ("app_settings"."news_minutes_before" between 0 and 120 and "app_settings"."news_minutes_after" between 0 and 120);--> statement-breakpoint
-- Hand-written: RLS and updated_at (same pattern as security_and_guards).
alter table public.economic_events enable row level security;--> statement-breakpoint
revoke all on public.economic_events from anon;--> statement-breakpoint
create policy owner_all on public.economic_events for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.economic_events for each row execute function public.set_updated_at();
