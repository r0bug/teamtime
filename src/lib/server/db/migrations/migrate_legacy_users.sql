-- Migration: Legacy Users to New Access Control System
-- This migration adds template support and backup tables for the user migration

-- 1. Add isTemplate column to user_types table
ALTER TABLE user_types ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

-- 2. Mark existing system user types as templates
UPDATE user_types SET is_template = true WHERE is_system = true;

-- 3. Create backup table for migration rollback
CREATE TABLE IF NOT EXISTS user_migration_backup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_role TEXT NOT NULL,
    original_user_type_id UUID,
    migrated_user_type_id UUID REFERENCES user_types(id),
    migrated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    reverted_at TIMESTAMP WITH TIME ZONE,
    migration_batch TEXT NOT NULL -- Identifier for batch migrations
);

-- 4. Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_migration_backup_user_id ON user_migration_backup(user_id);
CREATE INDEX IF NOT EXISTS idx_user_migration_backup_batch ON user_migration_backup(migration_batch);

-- 5. Add default_user_type_id setting if it doesn't exist
INSERT INTO app_settings (key, value, updated_at)
VALUES ('default_user_type_id', '', NOW())
ON CONFLICT (key) DO NOTHING;

-- 6. Add migration_status setting to track progress
INSERT INTO app_settings (key, value, updated_at)
VALUES ('user_migration_status', 'pending', NOW())
ON CONFLICT (key) DO NOTHING;

-- 7. Comment on new columns/tables
COMMENT ON COLUMN user_types.is_template IS 'Template user types can be copied but not deleted. System types are always templates.';
COMMENT ON TABLE user_migration_backup IS 'Backup table for user type migrations, allows rollback to original state';
