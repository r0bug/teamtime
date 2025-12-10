-- Migration: Add progress tracking fields to inventory_drops and create job queue table
-- Created: 2025-12-09
-- Description: Enables asynchronous inventory drop processing with background jobs

-- Add new enum for upload status
DO $$ BEGIN
    CREATE TYPE inventory_drop_upload_status AS ENUM ('pending', 'uploading', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new enum for job status
DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns to inventory_drops table
ALTER TABLE inventory_drops
    ADD COLUMN IF NOT EXISTS upload_status inventory_drop_upload_status NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS photos_total INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS photos_uploaded INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS upload_error TEXT,
    ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS finalize_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Create jobs table for background processing
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    status job_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL,
    result JSONB,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for job queue performance
CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at ON jobs (status, run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs (type);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);

-- Create index for inventory drops finalize task lookup
CREATE INDEX IF NOT EXISTS idx_inventory_drops_finalize_task ON inventory_drops (finalize_task_id) WHERE finalize_task_id IS NOT NULL;

-- Create index for inventory drops by upload status
CREATE INDEX IF NOT EXISTS idx_inventory_drops_upload_status ON inventory_drops (upload_status) WHERE upload_status != 'completed';

COMMENT ON TABLE jobs IS 'Database-backed job queue for background processing';
COMMENT ON COLUMN jobs.type IS 'Job type: inventory_drop_upload, inventory_drop_process, etc.';
COMMENT ON COLUMN jobs.priority IS 'Higher values = more urgent';
COMMENT ON COLUMN jobs.payload IS 'Job-specific data in JSON format';
COMMENT ON COLUMN jobs.result IS 'Result data on successful completion';
COMMENT ON COLUMN jobs.run_at IS 'When to run the job (for scheduled jobs)';
