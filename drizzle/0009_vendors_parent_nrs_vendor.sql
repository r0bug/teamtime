ALTER TABLE "vendors" ADD COLUMN "parent_nrs_vendor_id" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendors_parent_nrs_vendor_id" ON "vendors" ("parent_nrs_vendor_id");