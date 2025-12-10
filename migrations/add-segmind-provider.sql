-- Migration: Add 'segmind' to ai_provider enum
-- Date: 2025-12-10
-- Description: Adds Segmind as a third AI provider option alongside anthropic and openai

-- Add 'segmind' to the ai_provider enum if it doesn't already exist
DO $$
BEGIN
    -- Check if 'segmind' already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'segmind'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ai_provider')
    ) THEN
        ALTER TYPE ai_provider ADD VALUE 'segmind';
    END IF;
END
$$;
