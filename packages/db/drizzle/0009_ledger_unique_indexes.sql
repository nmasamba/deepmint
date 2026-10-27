-- Guard: the ledger tables (outcomes, events, instruments) are never
-- deleted from, so abort if any already holds a duplicate key. Resolve those
-- by hand before re-running.
DO $$
DECLARE dup_outcomes int; dup_events int; dup_instruments int;
BEGIN
  SELECT count(*) INTO dup_outcomes FROM (SELECT 1 FROM "outcomes" GROUP BY "claim_id", "horizon" HAVING count(*) > 1) d;
  SELECT count(*) INTO dup_events FROM (SELECT 1 FROM "events" GROUP BY "content_hash" HAVING count(*) > 1) d;
  SELECT count(*) INTO dup_instruments FROM (SELECT 1 FROM "instruments" GROUP BY "ticker" HAVING count(*) > 1) d;
  IF dup_outcomes + dup_events + dup_instruments > 0 THEN
    RAISE EXCEPTION 'Duplicate ledger keys: % outcome (claim, horizon), % event content_hash, % instrument ticker', dup_outcomes, dup_events, dup_instruments;
  END IF;
END $$;--> statement-breakpoint
-- Derived tables are recomputed on every run: keep the most recently computed
-- row for each key and delete the rest.
DELETE FROM "scores" a USING "scores" b
WHERE a."entity_id" = b."entity_id" AND a."metric" = b."metric"
  AND a."horizon" IS NOT DISTINCT FROM b."horizon"
  AND a."regime_tag" IS NOT DISTINCT FROM b."regime_tag"
  AND a."as_of_date" = b."as_of_date"
  AND (a."computed_at", a."id") < (b."computed_at", b."id");--> statement-breakpoint
DELETE FROM "consensus_signals" a USING "consensus_signals" b
WHERE a."instrument_id" = b."instrument_id" AND a."as_of_date" = b."as_of_date"
  AND (a."computed_at", a."id") < (b."computed_at", b."id");--> statement-breakpoint
DELETE FROM "influence_scores" a USING "influence_scores" b
WHERE a."guide_entity_id" = b."guide_entity_id" AND a."as_of_date" = b."as_of_date"
  AND (a."computed_at", a."id") < (b."computed_at", b."id");--> statement-breakpoint
ALTER TABLE "consensus_signals" ADD CONSTRAINT "consensus_signals_instrument_date_unique" UNIQUE("instrument_id","as_of_date");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_content_hash_unique" UNIQUE("content_hash");--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_ticker_unique" UNIQUE("ticker");--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_claim_horizon_unique" UNIQUE("claim_id","horizon");--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_entity_metric_horizon_regime_date_unique" UNIQUE NULLS NOT DISTINCT("entity_id","metric","horizon","regime_tag","as_of_date");--> statement-breakpoint
ALTER TABLE "influence_scores" ADD CONSTRAINT "influence_scores_guide_date_unique" UNIQUE("guide_entity_id","as_of_date");
