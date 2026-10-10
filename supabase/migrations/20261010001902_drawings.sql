CREATE TYPE "public"."drawing_tool" AS ENUM('horizontal', 'trend', 'long', 'short', 'measure');--> statement-breakpoint
CREATE TABLE "drawings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"session_id" uuid,
	"tool" "drawing_tool" NOT NULL,
	"points" jsonb NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawings_instrument_id_session_id_index" ON "drawings" USING btree ("instrument_id","session_id");--> statement-breakpoint
-- Hand-written: RLS and updated_at.
alter table public.drawings enable row level security;--> statement-breakpoint
revoke all on public.drawings from anon;--> statement-breakpoint
create policy owner_all on public.drawings for all to authenticated using (public.is_owner()) with check (public.is_owner());--> statement-breakpoint
create trigger set_updated_at before update on public.drawings for each row execute function public.set_updated_at();
