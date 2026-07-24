-- Floorplan layout snapshots: frozen copy of a plan's cell-attr rows so
-- admins can experiment on the live floor and revert. Restore replaces the
-- plan's cells wholesale; an 'auto' backup is captured first.
-- Matches floorplanSnapshots in src/lib/server/db/schema.ts.
CREATE TABLE IF NOT EXISTS "floorplan_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL REFERENCES "floorplan_plans"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"kind" text NOT NULL DEFAULT 'manual',
	"cells" jsonb NOT NULL,
	"attr_rows" integer NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
