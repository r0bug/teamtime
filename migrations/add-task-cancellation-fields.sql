-- Migration: Add Office Manager task cancellation fields
-- Date: 2025-12-10
-- Description: Adds fields to task_completions table for tracking task cancellations by Office Manager AI

-- Add cancellation tracking fields to task_completions
ALTER TABLE task_completions
ADD COLUMN IF NOT EXISTS cancelled_by_office_manager BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS counts_as_missed BOOLEAN DEFAULT FALSE;

-- Add comment explaining the fields
COMMENT ON COLUMN task_completions.cancelled_by_office_manager IS 'Whether this task was cancelled by the Office Manager AI agent';
COMMENT ON COLUMN task_completions.cancellation_reason IS 'Reason provided by Office Manager for cancelling the task';
COMMENT ON COLUMN task_completions.counts_as_missed IS 'Whether the cancellation counts against employee performance metrics';
