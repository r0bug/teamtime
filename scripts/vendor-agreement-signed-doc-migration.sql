-- Additive migration: store an uploaded signed-contract scan on a vendor agreement.
-- Distinct from signature_data_url (in-app signature) and paper_original_on_file
-- (paper in the cabinet, no scan). Applied directly to the push-managed prod DB.
-- Idempotent.

ALTER TABLE "vendor_agreements" ADD COLUMN IF NOT EXISTS "signed_document_path" text;
ALTER TABLE "vendor_agreements" ADD COLUMN IF NOT EXISTS "signed_document_original_name" text;
ALTER TABLE "vendor_agreements" ADD COLUMN IF NOT EXISTS "signed_document_mime_type" text;
ALTER TABLE "vendor_agreements" ADD COLUMN IF NOT EXISTS "signed_document_size_bytes" integer;
ALTER TABLE "vendor_agreements" ADD COLUMN IF NOT EXISTS "signed_document_uploaded_at" timestamp with time zone;
ALTER TABLE "vendor_agreements" ADD COLUMN IF NOT EXISTS "signed_document_uploaded_by_user_id" uuid;

DO $$ BEGIN
  ALTER TABLE "vendor_agreements" ADD CONSTRAINT "vendor_agreements_signed_document_uploaded_by_user_id_users_id_fk"
    FOREIGN KEY ("signed_document_uploaded_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
