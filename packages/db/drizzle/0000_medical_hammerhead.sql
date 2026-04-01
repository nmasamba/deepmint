CREATE TYPE "public"."broker_provider" AS ENUM('snaptrade', 'plaid');--> statement-breakpoint
CREATE TYPE "public"."broker_sync_status" AS ENUM('pending', 'active', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('pending_review', 'active', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('long', 'short', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."consensus_direction" AS ENUM('bullish', 'bearish', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."broker_link_status" AS ENUM('none', 'pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('player', 'guide');--> statement-breakpoint
CREATE TYPE "public"."asset_class" AS ENUM('equity', 'etf', 'crypto', 'forex', 'commodity', 'index');--> statement-breakpoint
CREATE TYPE "public"."exchange" AS ENUM('NYSE', 'NASDAQ', 'AMEX');--> statement-breakpoint
CREATE TYPE "public"."horizon" AS ENUM('1d', '1w', '1m', '3m', '6m', '1y');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TABLE "audit_roots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"merkle_root" varchar(64) NOT NULL,
	"claim_count" integer NOT NULL,
	"bitcoin_tx_id" varchar(64),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_roots_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "broker_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"provider" "broker_provider" NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"broker_name" varchar(100),
	"sync_status" "broker_sync_status" DEFAULT 'pending',
	"last_sync_at" timestamp with time zone,
	"sync_error_message" varchar(500),
	"is_verified" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"entity_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"direction" "direction" NOT NULL,
	"target_price_cents" integer,
	"horizon_days" integer NOT NULL,
	"confidence" integer,
	"rationale" text,
	"rationale_tags" jsonb DEFAULT '[]'::jsonb,
	"claim_status" "claim_status" DEFAULT 'active',
	"entry_price_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consensus_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"direction" "consensus_direction" NOT NULL,
	"long_count" integer DEFAULT 0 NOT NULL,
	"short_count" integer DEFAULT 0 NOT NULL,
	"neutral_count" integer DEFAULT 0 NOT NULL,
	"weighted_bullish_score" numeric(18, 6) DEFAULT '0' NOT NULL,
	"weighted_bearish_score" numeric(18, 6) DEFAULT '0' NOT NULL,
	"weighted_neutral_score" numeric(18, 6) DEFAULT '0' NOT NULL,
	"conviction_strength" numeric(5, 4) DEFAULT '0' NOT NULL,
	"avg_target_price_cents" integer,
	"target_dispersion_bps" integer,
	"active_claims" integer DEFAULT 0 NOT NULL,
	"as_of_date" date NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(255),
	"type" "entity_type" NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"bio" text,
	"avatar_url" varchar(500),
	"style_tags" jsonb DEFAULT '[]'::jsonb,
	"broker_link_status" "broker_link_status" DEFAULT 'none',
	"is_verified" boolean DEFAULT false,
	"is_allowlisted" boolean DEFAULT false,
	"source_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entities_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "entities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_url" varchar(2000),
	"raw_text" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"snapshot_path" varchar(500),
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"figi" varchar(12),
	"isin" varchar(12),
	"name" varchar(255) NOT NULL,
	"asset_class" "asset_class" DEFAULT 'equity' NOT NULL,
	"exchange" "exchange",
	"sector" varchar(100),
	"industry" varchar(100),
	"market_cap_bucket" varchar(20),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"note_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"horizon" "horizon" NOT NULL,
	"entry_price_cents" integer NOT NULL,
	"exit_price_cents" integer NOT NULL,
	"return_bps" integer NOT NULL,
	"direction_correct" boolean NOT NULL,
	"target_hit" boolean,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"side" "trade_side" NOT NULL,
	"entry_price_cents" integer NOT NULL,
	"exit_price_cents" integer,
	"quantity" numeric(18, 8) NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"metric" varchar(50) NOT NULL,
	"value" numeric(18, 6) NOT NULL,
	"horizon" varchar(10),
	"regime_tag" varchar(50),
	"as_of_date" date NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"followed_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"starting_balance_cents" integer DEFAULT 10000000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"side" "trade_side" NOT NULL,
	"entry_price_cents" integer NOT NULL,
	"exit_price_cents" integer,
	"quantity" numeric(18, 8) NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "influence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_entity_id" uuid NOT NULL,
	"guide_claim_id" uuid NOT NULL,
	"player_entity_id" uuid NOT NULL,
	"player_claim_id" uuid,
	"player_trade_id" uuid,
	"instrument_id" uuid NOT NULL,
	"lag_hours" numeric(10, 2) NOT NULL,
	"direction_match" boolean NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "influence_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_entity_id" uuid NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"influence_events_30d" integer DEFAULT 0 NOT NULL,
	"avg_lag_hours" numeric(10, 2),
	"top_instruments" jsonb DEFAULT '[]'::jsonb,
	"as_of_date" date NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broker_links" ADD CONSTRAINT "broker_links_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consensus_signals" ADD CONSTRAINT "consensus_signals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_trades" ADD CONSTRAINT "player_trades_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_trades" ADD CONSTRAINT "player_trades_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_entities_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followed_id_entities_id_fk" FOREIGN KEY ("followed_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_portfolios" ADD CONSTRAINT "paper_portfolios_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influence_events" ADD CONSTRAINT "influence_events_guide_entity_id_entities_id_fk" FOREIGN KEY ("guide_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influence_events" ADD CONSTRAINT "influence_events_guide_claim_id_claims_id_fk" FOREIGN KEY ("guide_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influence_events" ADD CONSTRAINT "influence_events_player_entity_id_entities_id_fk" FOREIGN KEY ("player_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influence_events" ADD CONSTRAINT "influence_events_player_claim_id_claims_id_fk" FOREIGN KEY ("player_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influence_events" ADD CONSTRAINT "influence_events_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influence_scores" ADD CONSTRAINT "influence_scores_guide_entity_id_entities_id_fk" FOREIGN KEY ("guide_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;