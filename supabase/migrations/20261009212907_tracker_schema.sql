CREATE TYPE "public"."account_phase" AS ENUM('p1', 'p2', 'funded', 'instant', 'other');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'passed', 'breached', 'merged', 'paused', 'closed_other', 'missing');--> statement-breakpoint
CREATE TYPE "public"."cashflow_kind" AS ENUM('challenge_fee', 'reset_fee', 'addon', 'payout', 'refund', 'other');--> statement-breakpoint
CREATE TYPE "public"."import_result" AS ENUM('ok', 'partial', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."risk_source" AS ENUM('journal_sl', 'journal_usd', 'full_stop_loss', 'estimated');--> statement-breakpoint
CREATE TYPE "public"."status_source" AS ENUM('firm_history', 'detected_on_import');--> statement-breakpoint
CREATE TYPE "public"."tag_kind" AS ENUM('setup', 'mistake', 'context');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."trade_source" AS ENUM('live', 'backtest');--> statement-breakpoint
CREATE TABLE "account_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "account_status" NOT NULL,
	"status_reason" text,
	"changed_at" timestamp with time zone NOT NULL,
	"source" "status_source" NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"external_id" bigint NOT NULL,
	"login" bigint NOT NULL,
	"parent_account_id" uuid,
	"phase" "account_phase" DEFAULT 'other' NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"platform" text,
	"type_label" text,
	"plan_raw" jsonb,
	"starting_balance" numeric(14, 2) NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone,
	"default_risk_pct" numeric(5, 2) DEFAULT '0.5' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"balance" numeric(14, 2) NOT NULL,
	"equity" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" bigint NOT NULL,
	"reason" text,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"stats_raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycles_externalId_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "rule_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"daily_loss_limit" numeric(6, 2),
	"max_loss_limit" numeric(6, 2),
	"profit_target" numeric(6, 2),
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbol_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"point_value_per_lot" numeric(12, 4) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"account_id" uuid,
	"kind" "cashflow_kind" NOT NULL,
	"amount_usd" numeric(14, 2) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"external_ref" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cashflows_externalRef_unique" UNIQUE("external_ref")
);
--> statement-breakpoint
CREATE TABLE "raw_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drive_file_id" text NOT NULL,
	"file_name" text NOT NULL,
	"generated_at" timestamp with time zone,
	"schema_version" integer,
	"status" text,
	"errors" jsonb,
	"payload" jsonb NOT NULL,
	"imported_at" timestamp with time zone,
	"import_result" "import_result",
	"import_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_health" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"last_file_at" timestamp with time zone,
	"last_ok_import_at" timestamp with time zone,
	"last_check_at" timestamp with time zone,
	"last_alert_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_health_single_row" CHECK ("sync_health"."id")
);
--> statement-breakpoint
CREATE TABLE "daily_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"notes" text,
	"mood" text,
	"market_context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_notes_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"setup_tag_id" uuid,
	"followed_plan" boolean,
	"initial_sl" numeric(18, 5),
	"planned_rr" numeric(10, 2),
	"planned_risk_usd" numeric(14, 2),
	"emotion_before" text,
	"emotion_after" text,
	"mistakes" text[],
	"notes" text,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_tradeId_unique" UNIQUE("trade_id"),
	CONSTRAINT "journal_entries_rating_range" CHECK ("journal_entries"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "tag_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_tags" (
	"trade_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "trade_tags_trade_id_tag_id_pk" PRIMARY KEY("trade_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"cycle_id" uuid,
	"source" "trade_source" DEFAULT 'live' NOT NULL,
	"ticket" text NOT NULL,
	"symbol" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"lots" numeric(12, 2) NOT NULL,
	"volume" bigint,
	"open_price" numeric(18, 5) NOT NULL,
	"close_price" numeric(18, 5) NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"sl_final" numeric(18, 5),
	"tp_final" numeric(18, 5),
	"profit" numeric(14, 2) NOT NULL,
	"commission" numeric(14, 2) DEFAULT '0' NOT NULL,
	"swap" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_profit" numeric(14, 2) GENERATED ALWAYS AS (profit + commission + swap) STORED NOT NULL,
	"firm_rr_raw" text,
	"firm_rr" numeric(10, 2),
	"is_news" boolean,
	"reason_code" integer,
	"risk_usd" numeric(14, 2),
	"risk_source" "risk_source",
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_status_history" ADD CONSTRAINT "account_status_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_account_id_accounts_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_snapshots" ADD CONSTRAINT "rule_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_specs" ADD CONSTRAINT "symbol_specs_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashflows" ADD CONSTRAINT "cashflows_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashflows" ADD CONSTRAINT "cashflows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_setup_tag_id_tags_id_fk" FOREIGN KEY ("setup_tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_status_history_account_id_changed_at_index" ON "account_status_history" USING btree ("account_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_firm_external_id_key" ON "accounts" USING btree ("firm_id","external_id");--> statement-breakpoint
CREATE INDEX "accounts_login_index" ON "accounts" USING btree ("login");--> statement-breakpoint
CREATE UNIQUE INDEX "balance_snapshots_account_id_taken_at_index" ON "balance_snapshots" USING btree ("account_id","taken_at");--> statement-breakpoint
CREATE INDEX "cycles_account_id_index" ON "cycles" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_snapshots_account_id_taken_at_index" ON "rule_snapshots" USING btree ("account_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "symbol_specs_firm_id_symbol_index" ON "symbol_specs" USING btree ("firm_id","symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_imports_drive_file_id_key" ON "raw_imports" USING btree ("drive_file_id");--> statement-breakpoint
CREATE INDEX "tags_kind_index" ON "tags" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_account_ticket_key" ON "trades" USING btree ("account_id","ticket");--> statement-breakpoint
CREATE INDEX "trades_account_id_closed_at_index" ON "trades" USING btree ("account_id","closed_at");--> statement-breakpoint
CREATE INDEX "trades_source_closed_at_index" ON "trades" USING btree ("source","closed_at");