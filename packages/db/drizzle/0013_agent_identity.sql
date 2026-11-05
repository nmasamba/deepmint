ALTER TABLE "api_keys" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "is_agent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;