-- Migration: Add Groups and Threads support
-- Run with: psql $DATABASE_URL -f migrations/add_groups_and_threads.sql

-- 1. Add 'group' to conversation_type enum
ALTER TYPE "conversation_type" ADD VALUE IF NOT EXISTS 'group';

-- 2. Add thread columns to messages table
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "parent_message_id" uuid REFERENCES "messages"("id") ON DELETE CASCADE;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "thread_reply_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "last_thread_reply_at" timestamp with time zone;

-- Create index for thread lookups
CREATE INDEX IF NOT EXISTS "messages_parent_message_id_idx" ON "messages"("parent_message_id");

-- 3. Create groups table
CREATE TABLE IF NOT EXISTS "groups" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "description" text,
    "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
    "linked_user_type_id" uuid REFERENCES "user_types"("id") ON DELETE SET NULL,
    "is_auto_synced" boolean NOT NULL DEFAULT false,
    "color" text DEFAULT '#6B7280',
    "is_active" boolean NOT NULL DEFAULT true,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "groups_conversation_id_unique" UNIQUE("conversation_id"),
    CONSTRAINT "groups_linked_user_type_id_unique" UNIQUE("linked_user_type_id")
);

-- 4. Create group_members table
CREATE TABLE IF NOT EXISTS "group_members" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "role" text NOT NULL DEFAULT 'member',
    "is_auto_assigned" boolean NOT NULL DEFAULT false,
    "joined_at" timestamp with time zone NOT NULL DEFAULT now(),
    "added_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "group_members_group_id_user_id_unique" UNIQUE("group_id", "user_id")
);

-- 5. Create thread_participants table
CREATE TABLE IF NOT EXISTS "thread_participants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "last_read_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "thread_participants_message_id_user_id_unique" UNIQUE("message_id", "user_id")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "groups_linked_user_type_id_idx" ON "groups"("linked_user_type_id");
CREATE INDEX IF NOT EXISTS "group_members_group_id_idx" ON "group_members"("group_id");
CREATE INDEX IF NOT EXISTS "group_members_user_id_idx" ON "group_members"("user_id");
CREATE INDEX IF NOT EXISTS "thread_participants_message_id_idx" ON "thread_participants"("message_id");
CREATE INDEX IF NOT EXISTS "thread_participants_user_id_idx" ON "thread_participants"("user_id");
