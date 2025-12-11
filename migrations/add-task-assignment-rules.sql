-- Task Assignment Rules Migration
-- Adds support for automatic task creation and assignment based on triggers

-- Create enum for rule trigger types
DO $$ BEGIN
    CREATE TYPE rule_trigger_type AS ENUM (
        'clock_in',
        'clock_out',
        'first_clock_in',
        'last_clock_out',
        'time_into_shift',
        'task_completed',
        'schedule'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum for assignment types
DO $$ BEGIN
    CREATE TYPE assignment_type AS ENUM (
        'specific_user',
        'clocked_in_user',
        'role_rotation',
        'location_staff',
        'least_tasks'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create task_assignment_rules table
CREATE TABLE IF NOT EXISTS task_assignment_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,

    -- Trigger configuration
    trigger_type rule_trigger_type NOT NULL,
    trigger_config JSONB NOT NULL DEFAULT '{}',
    -- trigger_config structure:
    -- {
    --   hoursIntoShift?: number,     // For 'time_into_shift'
    --   taskTemplateId?: string,      // For 'task_completed'
    --   cronExpression?: string       // For 'schedule'
    -- }

    -- Conditions
    conditions JSONB,
    -- conditions structure:
    -- {
    --   locationId?: string,
    --   roles?: string[],
    --   daysOfWeek?: number[],       // 0=Sunday, 6=Saturday
    --   timeWindowStart?: string,    // HH:MM format
    --   timeWindowEnd?: string       // HH:MM format
    -- }

    -- Assignment configuration
    assignment_type assignment_type NOT NULL,
    assignment_config JSONB,
    -- assignment_config structure:
    -- {
    --   userId?: string,             // For 'specific_user'
    --   roles?: string[],            // For rotation/staff/least_tasks
    --   rotationState?: { lastAssignedUserId?: string, rotationIndex?: number }
    -- }

    -- Rule priority (higher = checked first)
    priority INTEGER NOT NULL DEFAULT 0,

    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER NOT NULL DEFAULT 0,

    -- Audit
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_task_assignment_rules_template_id ON task_assignment_rules(template_id);
CREATE INDEX IF NOT EXISTS idx_task_assignment_rules_trigger_type ON task_assignment_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_task_assignment_rules_is_active ON task_assignment_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_task_assignment_rules_priority ON task_assignment_rules(priority DESC);

-- Add comment for documentation
COMMENT ON TABLE task_assignment_rules IS 'Configures automatic task creation and assignment based on various triggers like clock-in, schedules, or task completion';
