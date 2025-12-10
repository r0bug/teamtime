-- Add Inventory Drops Feature
-- This migration adds tables for batch item submission with LLM identification

-- Add inventory_drop to task_source enum
ALTER TYPE task_source ADD VALUE IF NOT EXISTS 'inventory_drop';

-- Create inventory drop status enum
DO $$ BEGIN
    CREATE TYPE inventory_drop_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Inventory drops table - batch submission of items for LLM identification
CREATE TABLE IF NOT EXISTS inventory_drops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    pick_notes TEXT,
    status inventory_drop_status NOT NULL DEFAULT 'pending',
    item_count INTEGER DEFAULT 0,
    processing_error TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory drop photos table
CREATE TABLE IF NOT EXISTS inventory_drop_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_id UUID NOT NULL REFERENCES inventory_drops(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory drop items table - items identified by LLM
CREATE TABLE IF NOT EXISTS inventory_drop_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_id UUID NOT NULL REFERENCES inventory_drops(id) ON DELETE CASCADE,
    item_description TEXT NOT NULL,
    suggested_price DECIMAL(10, 2),
    confidence_score DECIMAL(3, 2),
    source_photo_ids JSONB NOT NULL DEFAULT '[]',
    pricing_decision_id UUID REFERENCES pricing_decisions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inventory_drops_user_id ON inventory_drops(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_drops_status ON inventory_drops(status);
CREATE INDEX IF NOT EXISTS idx_inventory_drops_created_at ON inventory_drops(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_drop_photos_drop_id ON inventory_drop_photos(drop_id);
CREATE INDEX IF NOT EXISTS idx_inventory_drop_items_drop_id ON inventory_drop_items(drop_id);
CREATE INDEX IF NOT EXISTS idx_inventory_drop_items_pricing_decision_id ON inventory_drop_items(pricing_decision_id);

-- Grant permissions
GRANT ALL PRIVILEGES ON inventory_drops TO teamtime;
GRANT ALL PRIVILEGES ON inventory_drop_photos TO teamtime;
GRANT ALL PRIVILEGES ON inventory_drop_items TO teamtime;
