-- recorded_at says when a claim reached the ledger. It is added first with no
-- default and given one after, so existing rows keep a null: one statement with
-- DEFAULT now() would stamp every old claim with the time of this migration.
-- Neither statement touches a row, so claims_review_only does not fire.
ALTER TABLE "claims" ADD COLUMN "recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "recorded_at" SET DEFAULT now();--> statement-breakpoint
-- Default 1: every stored root used version 1, and so does any root the
-- deployed code writes before the version 2 code ships.
ALTER TABLE "audit_roots" ADD COLUMN "leaf_version" integer DEFAULT 1 NOT NULL;
