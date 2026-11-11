CREATE TABLE "paper_equity_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"as_of_date" date NOT NULL,
	"equity_cents" bigint NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_equity_snapshots_portfolio_date_unique" UNIQUE("portfolio_id","as_of_date")
);
--> statement-breakpoint
ALTER TABLE "paper_equity_snapshots" ADD CONSTRAINT "paper_equity_snapshots_portfolio_id_paper_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."paper_portfolios"("id") ON DELETE no action ON UPDATE no action;