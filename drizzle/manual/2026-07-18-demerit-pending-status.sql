-- Adds 'pending' to demerit_status: auto-detected demerits now await manager
-- review before points are deducted or the employee is notified.
-- Apply manually (ALTER TYPE ... ADD VALUE cannot run in the same transaction
-- that uses the new value):
--   psql "$DATABASE_URL" -f drizzle/manual/2026-07-18-demerit-pending-status.sql
ALTER TYPE "public"."demerit_status" ADD VALUE IF NOT EXISTS 'pending' BEFORE 'active';
