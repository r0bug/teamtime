CREATE TABLE IF NOT EXISTS "vendor_nrs_metadata_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid,
	"nrs_vendor_id" integer NOT NULL,
	"changed_by_user_id" uuid,
	"source" text NOT NULL,
	"fields" jsonb NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"response_body" jsonb,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_nrs_meta_log_vendor" ON "vendor_nrs_metadata_log" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_nrs_meta_log_created" ON "vendor_nrs_metadata_log" ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_nrs_metadata_log" ADD CONSTRAINT "vendor_nrs_metadata_log_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_nrs_metadata_log" ADD CONSTRAINT "vendor_nrs_metadata_log_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
