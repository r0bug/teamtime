-- Migration: Add Groups and Threads support (SUPERUSER REQUIRED)
-- Run with: sudo -u postgres psql -d teamtime -f migrations/add_groups_and_threads_superuser.sql

-- 1. Add 'group' to conversation_type enum
ALTER TYPE "conversation_type" ADD VALUE IF NOT EXISTS 'group';

-- 2. Add thread columns to messages table
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "parent_message_id" uuid REFERENCES "messages"("id") ON DELETE CASCADE;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "thread_reply_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "last_thread_reply_at" timestamp with time zone;

-- Create index for thread lookups
CREATE INDEX IF NOT EXISTS "messages_parent_message_id_idx" ON "messages"("parent_message_id");

-- 3. Grant ownership of new tables to teamtime user (optional, for consistency)
-- ALTER TABLE "groups" OWNER TO teamtime;
-- ALTER TABLE "group_members" OWNER TO teamtime;
-- ALTER TABLE "thread_participants" OWNER TO teamtime;
