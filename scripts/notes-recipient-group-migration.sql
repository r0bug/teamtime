-- Additive migration: add recipient_group to staff_notes (directed-at groups).
-- 'all_staff' | 'all_vendors'; null + null recipient_user_id = all staff (legacy).
-- Idempotent.

ALTER TABLE "staff_notes" ADD COLUMN IF NOT EXISTS "recipient_group" text;

CREATE INDEX IF NOT EXISTS "staff_notes_recipient_group_idx" ON "staff_notes" ("recipient_group");

-- Backfill: legacy rows with neither a group nor a user meant "all staff".
-- Without this they match no recipient filter and vanish from the dashboard.
UPDATE "staff_notes"
SET "recipient_group" = 'all_staff'
WHERE "recipient_group" IS NULL AND "recipient_user_id" IS NULL;
