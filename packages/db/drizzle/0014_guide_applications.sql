CREATE TYPE "public"."guide_application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "guide_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"pitch" text NOT NULL,
	"source_url" varchar(500),
	"claimed_guide_id" uuid,
	"linked_guide_id" uuid,
	"status" "guide_application_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guide_applications" ADD CONSTRAINT "guide_applications_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_applications" ADD CONSTRAINT "guide_applications_claimed_guide_id_entities_id_fk" FOREIGN KEY ("claimed_guide_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_applications" ADD CONSTRAINT "guide_applications_linked_guide_id_entities_id_fk" FOREIGN KEY ("linked_guide_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_applications" ADD CONSTRAINT "guide_applications_reviewed_by_entities_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guide_applications_one_pending" ON "guide_applications" USING btree ("entity_id") WHERE "guide_applications"."status" = 'pending';