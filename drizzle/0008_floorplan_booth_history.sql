CREATE TABLE IF NOT EXISTS "floorplan_booth_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"booth_key" text NOT NULL,
	"label" text NOT NULL,
	"names" jsonb NOT NULL,
	"vendor_ids" jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"sqft" integer NOT NULL,
	"rent_cents" integer DEFAULT 0 NOT NULL,
	"commission_percent" numeric(5, 2),
	"source" text DEFAULT 'cron' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floorplan_booth_history_month_booth_uq" UNIQUE("month","booth_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "floorplan_booth_history_month_idx" ON "floorplan_booth_history" ("month");