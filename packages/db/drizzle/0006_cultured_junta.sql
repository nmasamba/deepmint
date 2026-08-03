CREATE TYPE "public"."rating_action" AS ENUM('initiate', 'upgrade', 'downgrade', 'maintain', 'reiterate');--> statement-breakpoint
CREATE TYPE "public"."rating_grade" AS ENUM('strong_buy', 'buy', 'hold', 'sell', 'strong_sell');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('wall_street_rating', 'analyst_feed', 'self_logged');--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "source_kind" "source_kind";--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "rating_grade" "rating_grade";--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "rating_action" "rating_action";--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "analyst_name" varchar(200);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "publisher" varchar(200);