CREATE TABLE "email_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"digest_enabled" boolean DEFAULT true NOT NULL,
	"digest_frequency" varchar(10) DEFAULT 'daily' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_preferences_entity_id_unique" UNIQUE("entity_id")
);
--> statement-breakpoint
ALTER TABLE "email_preferences" ADD CONSTRAINT "email_preferences_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;