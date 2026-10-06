CREATE TABLE "market_regimes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"as_of_date" date NOT NULL,
	"regime" varchar(20) NOT NULL,
	"vix_level" numeric(8, 2) NOT NULL,
	"sp500_return_30d_bps" integer NOT NULL,
	"sector_dispersion_bps" integer NOT NULL,
	"defaulted_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_regimes_as_of_date_unique" UNIQUE("as_of_date")
);
