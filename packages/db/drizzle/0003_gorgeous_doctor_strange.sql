CREATE TABLE "signal_simulate_portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"followed_entity_id" uuid NOT NULL,
	"paper_portfolio_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signal_simulate_portfolios" ADD CONSTRAINT "signal_simulate_portfolios_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_simulate_portfolios" ADD CONSTRAINT "signal_simulate_portfolios_followed_entity_id_entities_id_fk" FOREIGN KEY ("followed_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_simulate_portfolios" ADD CONSTRAINT "signal_simulate_portfolios_paper_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("paper_portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;