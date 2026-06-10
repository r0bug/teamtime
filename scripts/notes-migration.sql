-- Additive migration: staff_notes table (post-it notes).
-- Applied directly to the push-managed prod DB. Idempotent.

CREATE TABLE IF NOT EXISTS "staff_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by_user_id" uuid,
  "recipient_user_id" uuid,
  "body" text,
  "photo_path" text,
  "photo_original_name" text,
  "photo_mime_type" text,
  "photo_size_bytes" integer,
  "status" text DEFAULT 'active' NOT NULL,
  "deleted_by_user_id" uuid,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_recipient_user_id_users_id_fk"
    FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_deleted_by_user_id_users_id_fk"
    FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "staff_notes_status_idx" ON "staff_notes" ("status");
CREATE INDEX IF NOT EXISTS "staff_notes_recipient_idx" ON "staff_notes" ("recipient_user_id");
