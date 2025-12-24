-- Add All Staff Task Assignment Feature
-- This migration adds support for tasks that can be assigned to all staff
-- Must be run as postgres user: sudo -u postgres psql -d teamtime -f migrations/add-all-staff-tasks.sql

-- Create the task assignment type enum
DO $$ BEGIN
    CREATE TYPE task_assignment_type AS ENUM ('individual', 'all_staff');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add assignment_type column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignment_type task_assignment_type NOT NULL DEFAULT 'individual';

-- Verify the migration
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name = 'assignment_type';
