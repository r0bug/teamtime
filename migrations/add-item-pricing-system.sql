-- Migration: Add Item Pricing and eBay Routing System
-- Date: 2024-12-08
-- Description: Creates tables for tracking item pricing decisions and eBay routing

-- Add canListOnEbay column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_list_on_ebay BOOLEAN NOT NULL DEFAULT false;

-- Create pricing destination enum
DO $$ BEGIN
    CREATE TYPE pricing_destination AS ENUM ('store', 'ebay');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add ebay_listing to task_source enum if it doesn't exist
-- Note: PostgreSQL doesn't support easy enum modification, so we check first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'ebay_listing'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_source')
    ) THEN
        ALTER TYPE task_source ADD VALUE 'ebay_listing';
    END IF;
END $$;

-- Create pricing_decisions table
CREATE TABLE IF NOT EXISTS pricing_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_description TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    price_justification TEXT NOT NULL,
    destination pricing_destination NOT NULL DEFAULT 'store',
    ebay_reason TEXT,
    ebay_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    address TEXT,
    priced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Note: No updated_at - pricing decisions are immutable for audit purposes
);

-- Create pricing_decision_photos table
CREATE TABLE IF NOT EXISTS pricing_decision_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pricing_decision_id UUID NOT NULL REFERENCES pricing_decisions(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    captured_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pricing_decisions_user_id ON pricing_decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_pricing_decisions_destination ON pricing_decisions(destination);
CREATE INDEX IF NOT EXISTS idx_pricing_decisions_priced_at ON pricing_decisions(priced_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_decisions_ebay_task_id ON pricing_decisions(ebay_task_id);
CREATE INDEX IF NOT EXISTS idx_pricing_decision_photos_decision_id ON pricing_decision_photos(pricing_decision_id);
CREATE INDEX IF NOT EXISTS idx_users_can_list_on_ebay ON users(can_list_on_ebay) WHERE can_list_on_ebay = true;

-- Add constraint: ebay_reason is required when destination is 'ebay'
ALTER TABLE pricing_decisions DROP CONSTRAINT IF EXISTS check_ebay_reason_required;
ALTER TABLE pricing_decisions ADD CONSTRAINT check_ebay_reason_required
    CHECK (destination = 'store' OR (destination = 'ebay' AND ebay_reason IS NOT NULL AND ebay_reason != ''));

-- Add constraint: price must be positive
ALTER TABLE pricing_decisions DROP CONSTRAINT IF EXISTS check_price_positive;
ALTER TABLE pricing_decisions ADD CONSTRAINT check_price_positive CHECK (price > 0);

-- Add constraint: price_justification must not be empty
ALTER TABLE pricing_decisions DROP CONSTRAINT IF EXISTS check_justification_not_empty;
ALTER TABLE pricing_decisions ADD CONSTRAINT check_justification_not_empty
    CHECK (LENGTH(TRIM(price_justification)) >= 10);

-- Comment on tables
COMMENT ON TABLE pricing_decisions IS 'Immutable record of all item pricing decisions for audit purposes';
COMMENT ON TABLE pricing_decision_photos IS 'Photos attached to pricing decisions';
COMMENT ON COLUMN pricing_decisions.price_justification IS 'Required explanation of why this price was chosen';
COMMENT ON COLUMN pricing_decisions.ebay_reason IS 'Required when destination=ebay, explains why item should be listed on eBay';
COMMENT ON COLUMN pricing_decisions.ebay_task_id IS 'Auto-created task for eBay listing when destination=ebay';
COMMENT ON COLUMN users.can_list_on_ebay IS 'User is allowed to claim and complete eBay listing tasks';
