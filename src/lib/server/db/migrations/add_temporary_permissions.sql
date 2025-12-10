-- Migration: Add temporary permissions table for Office Manager AI
-- Allows time-limited permission grants with audit trail

-- 1. Create temporary permissions table
CREATE TABLE IF NOT EXISTS temporary_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- What type of change: 'permission_grant', 'permission_revoke', 'user_type_change'
    change_type TEXT NOT NULL,

    -- For permission grants/revokes
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,

    -- For user type changes
    original_user_type_id UUID REFERENCES user_types(id),
    new_user_type_id UUID REFERENCES user_types(id),

    -- Timing
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- NULL means permanent until manually revoked
    revoked_at TIMESTAMP WITH TIME ZONE,

    -- Who made the change
    granted_by_user_id UUID REFERENCES users(id),
    granted_by_ai_run_id UUID,

    -- Justification and audit
    justification TEXT NOT NULL,
    approval_status TEXT NOT NULL DEFAULT 'auto_approved', -- 'pending', 'approved', 'rejected', 'auto_approved'
    approved_by_user_id UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,

    -- Rollback capability
    is_active BOOLEAN NOT NULL DEFAULT true,
    rolled_back_at TIMESTAMP WITH TIME ZONE,
    rolled_back_by_user_id UUID REFERENCES users(id),

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_temp_perms_user_id ON temporary_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_temp_perms_active ON temporary_permissions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_temp_perms_expires ON temporary_permissions(expires_at) WHERE expires_at IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_temp_perms_approval ON temporary_permissions(approval_status) WHERE approval_status = 'pending';

-- 3. Create permission change notifications table
CREATE TABLE IF NOT EXISTS permission_change_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temporary_permission_id UUID NOT NULL REFERENCES temporary_permissions(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL, -- 'user', 'manager', 'admin'
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    delivery_method TEXT NOT NULL DEFAULT 'in_app', -- 'in_app', 'sms', 'email'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perm_notif_recipient ON permission_change_notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_perm_notif_unread ON permission_change_notifications(recipient_user_id) WHERE read_at IS NULL;

-- 4. Add comments
COMMENT ON TABLE temporary_permissions IS 'Tracks temporary permission changes made by Office Manager AI or admins';
COMMENT ON COLUMN temporary_permissions.change_type IS 'Type of change: permission_grant, permission_revoke, user_type_change';
COMMENT ON COLUMN temporary_permissions.approval_status IS 'For sensitive changes requiring human approval';
COMMENT ON TABLE permission_change_notifications IS 'Notifications sent when permissions are changed';
