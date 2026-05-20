CREATE TABLE IF NOT EXISTS "kit_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"kit_id" text,
	"owner_type" text DEFAULT 'vendor_byo' NOT NULL,
	"printer_model" text NOT NULL,
	"printer_dpi" integer NOT NULL,
	"label_width_dots" integer NOT NULL,
	"label_height_dots" integer NOT NULL,
	"command_lang" text DEFAULT 'zpl2' NOT NULL,
	"media_sensor" text DEFAULT 'gap' NOT NULL,
	"media_type" text DEFAULT 'direct_thermal' NOT NULL,
	"backend" text NOT NULL,
	"preferred_format_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kit_profiles_vendor_kit_unique" UNIQUE("vendor_id","kit_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kit_profiles" ADD CONSTRAINT "kit_profiles_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
