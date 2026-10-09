ALTER TABLE "sync_health" ADD COLUMN "last_run_error_kind" text;--> statement-breakpoint
ALTER TABLE "sync_health" ADD COLUMN "last_run_error" text;--> statement-breakpoint
ALTER TABLE "sync_health" ADD COLUMN "last_run_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_health" ADD COLUMN "unhealthy_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_health" ADD COLUMN "active_conditions" jsonb;--> statement-breakpoint
CREATE INDEX "alerts_log_kind_sent_at_index" ON "alerts_log" USING btree ("kind","sent_at");