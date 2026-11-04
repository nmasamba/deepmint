-- The ledger is append-only: events, notes and outcomes take INSERT only, and
-- claims take one UPDATE, the review decision. These are triggers rather than
-- revoked privileges because the app connects as the role that owns the
-- tables. A deliberate correction disables a trigger inside a transaction
-- (README, "Correcting the ledger").
CREATE FUNCTION "ledger_reject_write"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: the ledger is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;--> statement-breakpoint
-- A claim may change only by review: pending_review to active or rejected,
-- with every other column as it was. to_jsonb compares whole rows, so columns
-- added later are covered too.
CREATE FUNCTION "claims_review_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."claim_status" = 'pending_review'
    AND NEW."claim_status" IN ('active', 'rejected')
    AND to_jsonb(NEW) - 'claim_status' = to_jsonb(OLD) - 'claim_status' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'UPDATE on claims is not allowed: only pending_review to active or rejected, with nothing else changed'
    USING ERRCODE = 'restrict_violation';
END
$$;--> statement-breakpoint
CREATE TRIGGER "events_append_only" BEFORE UPDATE OR DELETE ON "events" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_write"();--> statement-breakpoint
CREATE TRIGGER "events_no_truncate" BEFORE TRUNCATE ON "events" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_write"();--> statement-breakpoint
CREATE TRIGGER "notes_append_only" BEFORE UPDATE OR DELETE ON "notes" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_write"();--> statement-breakpoint
CREATE TRIGGER "notes_no_truncate" BEFORE TRUNCATE ON "notes" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_write"();--> statement-breakpoint
CREATE TRIGGER "outcomes_append_only" BEFORE UPDATE OR DELETE ON "outcomes" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_write"();--> statement-breakpoint
CREATE TRIGGER "outcomes_no_truncate" BEFORE TRUNCATE ON "outcomes" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_write"();--> statement-breakpoint
CREATE TRIGGER "claims_no_delete" BEFORE DELETE ON "claims" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_write"();--> statement-breakpoint
CREATE TRIGGER "claims_no_truncate" BEFORE TRUNCATE ON "claims" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_write"();--> statement-breakpoint
CREATE TRIGGER "claims_review_only" BEFORE UPDATE ON "claims" FOR EACH ROW EXECUTE FUNCTION "claims_review_only"();
