CREATE TABLE IF NOT EXISTS "nrs_inventory_api_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid,
	"pending_change_id" uuid,
	"triggered_by_user_id" uuid,
	"action" "inventory_change_type" NOT NULL,
	"endpoint" text NOT NULL,
	"part_number" text,
	"nrs_vendor_id" integer,
	"nrs_part_id" integer,
	"request_payload" jsonb,
	"response_body" jsonb,
	"http_status" integer,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nrs_inv_api_log_vendor" ON "nrs_inventory_api_log" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nrs_inv_api_log_created" ON "nrs_inventory_api_log" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nrs_inv_api_log_success" ON "nrs_inventory_api_log" ("success");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nrs_inventory_api_log" ADD CONSTRAINT "nrs_inventory_api_log_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nrs_inventory_api_log" ADD CONSTRAINT "nrs_inventory_api_log_pending_change_id_pending_inventory_changes_id_fk" FOREIGN KEY ("pending_change_id") REFERENCES "pending_inventory_changes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nrs_inventory_api_log" ADD CONSTRAINT "nrs_inventory_api_log_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
