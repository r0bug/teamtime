-- Vendor newsletters: block-composed staff→vendor mailings + per-recipient
-- delivery audit. Matches vendorNewsletters / vendorNewsletterSends in
-- src/lib/server/db/schema.ts. Additive + idempotent.
-- Apply:  psql "$DATABASE_URL" -f <this>

DO $$ BEGIN
  CREATE TYPE vendor_newsletter_status AS ENUM ('draft', 'sent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS vendor_newsletters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status vendor_newsletter_status NOT NULL DEFAULT 'draft',
  publish_to_portal boolean NOT NULL DEFAULT true,
  sent_at timestamptz,
  sent_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_newsletter_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id uuid NOT NULL REFERENCES vendor_newsletters(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_newsletter_sends_newsletter
  ON vendor_newsletter_sends(newsletter_id);
