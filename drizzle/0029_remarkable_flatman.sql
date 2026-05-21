ALTER TABLE "label_formats" ADD COLUMN "media_shape" text DEFAULT 'rectangle' NOT NULL;
--> statement-breakpoint
ALTER TABLE "label_formats" ADD COLUMN "shape_dims_json" jsonb;
--> statement-breakpoint
ALTER TABLE "label_formats" ADD COLUMN "media_sensor" text;
--> statement-breakpoint
ALTER TABLE "label_formats" ADD COLUMN "category" text DEFAULT 'sheet' NOT NULL;
--> statement-breakpoint
ALTER TABLE "label_formats" ADD COLUMN "manufacturer" text DEFAULT 'custom' NOT NULL;
--> statement-breakpoint
ALTER TABLE "label_formats" ADD COLUMN "part_number" text;
--> statement-breakpoint
ALTER TABLE "label_formats" ADD COLUMN "dpi" integer;
--> statement-breakpoint
ALTER TABLE "label_formats" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
