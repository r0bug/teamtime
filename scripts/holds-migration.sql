-- Additive migration: customer_holds table + enums.
-- Applied directly to the push-managed prod DB (no drizzle journal). Idempotent.

DO $$ BEGIN
  CREATE TYPE "hold_reason" AS ENUM ('awaiting_price', 'awaiting_vendor_acceptance', 'customer_pickup', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "hold_cleared_reason" AS ENUM ('price_received', 'sold', 'returned_to_shelf', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "customer_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by_user_id" uuid,
  "reason" "hold_reason" NOT NULL,
  "missing_price" boolean DEFAULT false NOT NULL,
  "customer_name" text,
  "customer_phone" text,
  "item_description" text,
  "pickup_date" date,
  "notes" text,
  "photo_path" text NOT NULL,
  "photo_original_name" text NOT NULL,
  "photo_mime_type" text NOT NULL,
  "photo_size_bytes" integer NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "cleared_reason" "hold_cleared_reason",
  "cleared_by_user_id" uuid,
  "cleared_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "customer_holds" ADD CONSTRAINT "customer_holds_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_holds" ADD CONSTRAINT "customer_holds_cleared_by_user_id_users_id_fk"
    FOREIGN KEY ("cleared_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "customer_holds_status_idx" ON "customer_holds" ("status");
