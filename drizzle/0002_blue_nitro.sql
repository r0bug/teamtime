CREATE TABLE IF NOT EXISTS "vendor_inventory_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"nrs_vendor_id" integer NOT NULL,
	"inv_stock_id" integer NOT NULL,
	"part_number" text,
	"name" text,
	"description" text,
	"retail_price_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_vendor_inventory_snapshot_item" UNIQUE("vendor_id","inv_stock_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_inventory_snapshot_vendor" ON "vendor_inventory_snapshot" ("vendor_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_inventory_snapshot" ADD CONSTRAINT "vendor_inventory_snapshot_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
