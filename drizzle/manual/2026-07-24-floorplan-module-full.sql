-- Floorplan module: complete DDL for a database that has never had it
-- (production). Statements extracted from the re-baselined drizzle/0000
-- migration; everything is idempotent, safe to re-run.
-- Companion data load: pg_dump --data-only the floorplan_* tables from the
-- dev box (canonical painted floor) and restore here.
-- Supersedes drizzle/manual/2026-07-23-floorplan-snapshots.sql (included).

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'floorplan_sync';

CREATE TABLE IF NOT EXISTS "floorplan_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"grid_w" integer DEFAULT 200 NOT NULL,
	"grid_h" integer DEFAULT 200 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "floorplan_cell_attrs" (
	"plan_id" uuid NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "floorplan_cell_attrs_plan_id_x_y_key_pk" PRIMARY KEY("plan_id","x","y","key")
);

CREATE TABLE IF NOT EXISTS "floorplan_attr_defs" (
	"plan_id" uuid NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"owner_system" text DEFAULT 'floorplan' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"render_hint" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floorplan_attr_defs_plan_id_key_pk" PRIMARY KEY("plan_id","key")
);

CREATE TABLE IF NOT EXISTS "floorplan_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"join_attr" text NOT NULL,
	"caps" jsonb NOT NULL,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "floorplan_cell_count_cache" (
	"plan_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"cells" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floorplan_cell_count_cache_plan_id_key_value_pk" PRIMARY KEY("plan_id","key","value")
);

CREATE TABLE IF NOT EXISTS "floorplan_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor_ids" jsonb NOT NULL,
	"color" text DEFAULT '#7C3AED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floorplan_pools_plan_id_name_unique" UNIQUE("plan_id","name")
);

CREATE TABLE IF NOT EXISTS "floorplan_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"cells" jsonb NOT NULL,
	"attr_rows" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "floorplan_cell_attrs_plan_key_value_idx" ON "floorplan_cell_attrs" ("plan_id","key","value");

DO $$ BEGIN
 ALTER TABLE "floorplan_cell_attrs" ADD CONSTRAINT "floorplan_cell_attrs_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "floorplan_attr_defs" ADD CONSTRAINT "floorplan_attr_defs_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "floorplan_connectors" ADD CONSTRAINT "floorplan_connectors_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "floorplan_cell_count_cache" ADD CONSTRAINT "floorplan_cell_count_cache_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "floorplan_pools" ADD CONSTRAINT "floorplan_pools_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "floorplan_snapshots" ADD CONSTRAINT "floorplan_snapshots_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "floorplan_snapshots" ADD CONSTRAINT "floorplan_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
