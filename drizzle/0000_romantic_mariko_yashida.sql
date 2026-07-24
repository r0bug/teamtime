DO $$ BEGIN
 CREATE TYPE "achievement_tier" AS ENUM('bronze', 'silver', 'gold', 'platinum');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "agreement_template_kind" AS ENUM('primary', 'addon');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ai_agent" AS ENUM('office_manager', 'revenue_optimizer', 'architect');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ai_memory_scope" AS ENUM('user', 'location', 'global');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ai_policy_scope" AS ENUM('global', 'location', 'role');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ai_provider" AS ENUM('anthropic', 'openai', 'segmind', 'deepseek');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ai_tone" AS ENUM('helpful_parent', 'professional', 'casual', 'formal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "architecture_category" AS ENUM('schema', 'api', 'ui', 'integration', 'security', 'architecture');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "architecture_status" AS ENUM('proposed', 'approved', 'in_progress', 'implemented', 'rejected', 'superseded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "assignment_type" AS ENUM('specific_user', 'clocked_in_user', 'role_rotation', 'location_staff', 'least_tasks');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "cash_count_trigger" AS ENUM('shift_start', 'shift_end', 'manual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "clock_out_warning_type" AS ENUM('auto_reminder', 'force_clockout');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "conversation_type" AS ENUM('direct', 'broadcast', 'group');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "demerit_status" AS ENUM('pending', 'active', 'appealed', 'overturned', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "demerit_type" AS ENUM('clock_out_violation', 'late_arrival', 'attendance', 'task_performance', 'policy_violation', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "hold_cleared_reason" AS ENUM('price_received', 'sold', 'returned_to_shelf', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "hold_reason" AS ENUM('awaiting_price', 'awaiting_vendor_acceptance', 'customer_pickup', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "inventory_change_status" AS ENUM('pending', 'applied', 'rejected', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "inventory_change_type" AS ENUM('create', 'update', 'delete');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "inventory_drop_status" AS ENUM('pending', 'processing', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "inventory_drop_upload_status" AS ENUM('pending', 'uploading', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "late_arrival_warning_type" AS ENUM('auto_reminder', 'escalated');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "login_attempt_result" AS ENUM('success', 'invalid_credentials', 'account_locked', 'account_disabled', '2fa_required', '2fa_failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "metric_aggregation" AS ENUM('sum', 'avg', 'min', 'max', 'count', 'last');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "metric_period_type" AS ENUM('hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "metric_source" AS ENUM('teamtime', 'lob_scraper', 'api', 'manual', 'computed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "notification_type" AS ENUM('task_assigned', 'task_due', 'task_overdue', 'schedule_change', 'shift_request', 'new_message', 'purchase_decision', 'shift_reminder', 'floorplan_sync');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "pending_action_status" AS ENUM('pending', 'approved', 'rejected', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "point_category" AS ENUM('attendance', 'task', 'pricing', 'sales', 'bonus', 'achievement');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "presentation_mode" AS ENUM('synthesized', 'side_by_side', 'primary_with_notes');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "pricing_destination" AS ENUM('store', 'ebay');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "print_job_status" AS ENUM('queued', 'claimed', 'printed', 'failed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "purchase_status" AS ENUM('pending', 'approved', 'denied');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "rule_trigger_type" AS ENUM('clock_in', 'clock_out', 'first_clock_in', 'last_clock_out', 'time_into_shift', 'task_completed', 'schedule', 'closing_shift');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "shift_request_status" AS ENUM('open', 'filled', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "shift_response_status" AS ENUM('accepted', 'declined');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "shoutout_category" AS ENUM('teamwork', 'quality', 'initiative', 'customer', 'mentoring', 'innovation', 'reliability', 'general');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "shoutout_status" AS ENUM('pending', 'approved', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "sms_direction" AS ENUM('outbound', 'inbound');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "sms_status" AS ENUM('queued', 'sent', 'delivered', 'undelivered', 'failed', 'received', 'opt_out');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "social_media_platform" AS ENUM('instagram', 'facebook', 'tiktok', 'youtube', 'twitter', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "tag_font_scale" AS ENUM('small', 'medium', 'large');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "tag_format" AS ENUM('avery_5160', 'avery_5163', 'avery_5167', 'zebra_2x1', 'zebra_4x2');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "task_assignment_type" AS ENUM('individual', 'all_staff');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "task_priority" AS ENUM('low', 'medium', 'high', 'urgent');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "task_source" AS ENUM('manual', 'recurring', 'event_triggered', 'purchase_approval', 'ebay_listing', 'inventory_drop');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "task_status" AS ENUM('not_started', 'in_progress', 'completed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "trigger_event" AS ENUM('clock_in', 'clock_out', 'first_clock_in', 'last_clock_out');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "user_role" AS ENUM('admin', 'manager', 'purchaser', 'staff');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "vendor_agreement_status" AS ENUM('signed', 'voided');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "vendor_newsletter_status" AS ENUM('draft', 'sent');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "vendor_status" AS ENUM('active', 'inactive', 'terminated');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "visibility_category" AS ENUM('tasks', 'messages', 'schedule', 'attendance', 'users', 'pricing', 'expenses');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "visibility_grant_type" AS ENUM('view', 'view_summary', 'none');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "visibility_group_type" AS ENUM('team', 'store', 'department', 'custom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "visibility_level" AS ENUM('none', 'own', 'same_group', 'same_role', 'lower_roles', 'all');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "withdrawal_status" AS ENUM('unassigned', 'partially_assigned', 'fully_spent');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_lockouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"failed_attempts" integer NOT NULL,
	"unlocked_at" timestamp with time zone,
	"unlocked_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" "point_category" NOT NULL,
	"tier" "achievement_tier" NOT NULL,
	"icon" text,
	"point_reward" integer DEFAULT 0 NOT NULL,
	"criteria" jsonb NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agreement_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"kind" "agreement_template_kind" NOT NULL,
	"body_markdown" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"supersedes_id" uuid,
	"extra_fields_schema" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" "ai_agent" NOT NULL,
	"run_id" uuid NOT NULL,
	"run_started_at" timestamp with time zone NOT NULL,
	"context_snapshot" jsonb,
	"context_tokens" integer,
	"provider" "ai_provider",
	"model" text,
	"reasoning" text,
	"tool_name" text,
	"tool_params" jsonb,
	"executed" boolean DEFAULT false NOT NULL,
	"execution_result" jsonb,
	"blocked_reason" text,
	"error" text,
	"target_user_id" uuid,
	"created_task_id" uuid,
	"created_message_id" uuid,
	"tokens_used" integer,
	"cost_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent" "ai_agent" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider" "ai_provider" DEFAULT 'anthropic' NOT NULL,
	"model" text DEFAULT 'claude-3-haiku-20240307' NOT NULL,
	"tone" "ai_tone" DEFAULT 'helpful_parent' NOT NULL,
	"instructions" text,
	"cron_schedule" text DEFAULT '*/15 7-19 * * *' NOT NULL,
	"operational_start_hour" integer DEFAULT 9 NOT NULL,
	"operational_end_hour" integer DEFAULT 17 NOT NULL,
	"operational_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb,
	"run_interval_minutes" integer DEFAULT 15 NOT NULL,
	"max_tokens_context" integer DEFAULT 4000 NOT NULL,
	"temperature" numeric(2, 1) DEFAULT '0.3' NOT NULL,
	"dry_run_mode" boolean DEFAULT false NOT NULL,
	"send_to_all_admins" boolean DEFAULT true NOT NULL,
	"specific_recipient_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_config_agent_unique" UNIQUE("agent")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_context_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" text NOT NULL,
	"provider_id" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority_override" integer,
	"custom_context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_context_config_agent_provider_id_unique" UNIQUE("agent","provider_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_context_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" text NOT NULL,
	"provider_id" text NOT NULL,
	"keyword" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_cooldowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" "ai_agent" NOT NULL,
	"user_id" uuid,
	"action_type" text NOT NULL,
	"related_entity_id" uuid,
	"related_entity_type" text,
	"expires_at" timestamp with time zone NOT NULL,
	"reason" text,
	"ai_action_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "ai_memory_scope" NOT NULL,
	"user_id" uuid,
	"location_id" uuid,
	"memory_type" text NOT NULL,
	"content" text NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0.50' NOT NULL,
	"observation_count" integer DEFAULT 1 NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_pending_work" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" "ai_agent" NOT NULL,
	"run_id" uuid NOT NULL,
	"remaining_tasks" jsonb NOT NULL,
	"completed_actions" jsonb DEFAULT '[]'::jsonb,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"iteration_count" integer DEFAULT 1 NOT NULL,
	"max_iterations" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_policy_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "ai_policy_scope" DEFAULT 'global' NOT NULL,
	"location_id" uuid,
	"target_role" "user_role",
	"content" text NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by_run_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_token_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" "ai_agent" NOT NULL,
	"run_id" uuid NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"tools_used" jsonb DEFAULT '[]'::jsonb,
	"actions_taken" integer DEFAULT 0 NOT NULL,
	"was_skipped" boolean DEFAULT false NOT NULL,
	"skip_reason" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_tool_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" text NOT NULL,
	"tool_name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"requires_confirmation" boolean,
	"cooldown_per_user_minutes" integer,
	"cooldown_global_minutes" integer,
	"rate_limit_max_per_hour" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tool_config_agent_tool_name_unique" UNIQUE("agent","tool_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_tool_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" text NOT NULL,
	"tool_name" text NOT NULL,
	"keyword" text NOT NULL,
	"match_type" text DEFAULT 'contains' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "allocation_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"original_name" text NOT NULL,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "architect_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"quick_provider" "ai_provider" DEFAULT 'anthropic' NOT NULL,
	"quick_model" text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
	"standard_provider" "ai_provider" DEFAULT 'anthropic' NOT NULL,
	"standard_model" text DEFAULT 'claude-opus-4-20250514' NOT NULL,
	"deliberate_primary_provider" "ai_provider" DEFAULT 'anthropic' NOT NULL,
	"deliberate_primary_model" text DEFAULT 'claude-opus-4-20250514' NOT NULL,
	"deliberate_review_provider" "ai_provider" DEFAULT 'openai' NOT NULL,
	"deliberate_review_model" text DEFAULT 'gpt-4o' NOT NULL,
	"deliberate_synth_provider" "ai_provider" DEFAULT 'anthropic' NOT NULL,
	"deliberate_synth_model" text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
	"trigger_on_adr_creation" boolean DEFAULT true NOT NULL,
	"trigger_on_prompt_generation" boolean DEFAULT true NOT NULL,
	"trigger_on_schema_design" boolean DEFAULT true NOT NULL,
	"trigger_on_explicit_request" boolean DEFAULT true NOT NULL,
	"presentation_mode" "presentation_mode" DEFAULT 'synthesized' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "architecture_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context_modules" jsonb,
	"tokens_used" integer DEFAULT 0,
	"cost_cents" integer DEFAULT 0,
	"decisions_created" jsonb DEFAULT '[]'::jsonb,
	"prompts_generated" integer DEFAULT 0,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "architecture_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" "architecture_status" DEFAULT 'proposed' NOT NULL,
	"category" "architecture_category" NOT NULL,
	"context" text NOT NULL,
	"decision" text NOT NULL,
	"consequences" text,
	"claude_code_prompt" text,
	"implementation_plan" jsonb,
	"related_files" jsonb,
	"implemented_at" timestamp with time zone,
	"created_by_ai_run_id" uuid,
	"created_by_chat_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "atm_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"withdrawn_at" timestamp with time zone NOT NULL,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"address" text,
	"receipt_photo_path" text,
	"status" "withdrawal_status" DEFAULT 'unassigned' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_data" jsonb,
	"after_data" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "award_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "shoutout_category" NOT NULL,
	"points" integer NOT NULL,
	"icon" text DEFAULT '⭐',
	"color" text DEFAULT '#F59E0B',
	"is_active" boolean DEFAULT true NOT NULL,
	"manager_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "break_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"break_start" timestamp with time zone NOT NULL,
	"break_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_count_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"fields" jsonb NOT NULL,
	"trigger_type" "cash_count_trigger" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_count_task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"config_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"time_entry_id" uuid,
	"values" jsonb NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"notes" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clock_out_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"warning_type" "clock_out_warning_type" NOT NULL,
	"issued_by" uuid,
	"sms_result" jsonb,
	"shift_end_time" timestamp with time zone,
	"minutes_past_shift_end" integer,
	"reason" text,
	"escalated_to_demerit" boolean DEFAULT false NOT NULL,
	"demerit_id" uuid,
	"user_reply" text,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	"is_archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "conversation_type" DEFAULT 'direct' NOT NULL,
	"title" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_user_id" uuid,
	"reason" "hold_reason" NOT NULL,
	"missing_price" boolean DEFAULT false NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"item_description" text,
	"pickup_date" date,
	"notes" text,
	"photo_path" text NOT NULL,
	"photo_original_name" text NOT NULL,
	"photo_mime_type" text NOT NULL,
	"photo_size_bytes" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"cleared_reason" "hold_cleared_reason",
	"cleared_by_user_id" uuid,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "day_of_week_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now(),
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"day_of_week" integer NOT NULL,
	"days_observed" integer DEFAULT 0,
	"avg_worker_count" numeric(6, 2),
	"avg_total_hours" numeric(10, 2),
	"avg_daily_sales" numeric(12, 2),
	"avg_retained" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "day_of_week_metrics_day_of_week_period_start_period_end_unique" UNIQUE("day_of_week","period_start","period_end")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demerits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "demerit_type" NOT NULL,
	"status" "demerit_status" DEFAULT 'active' NOT NULL,
	"issued_by" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"points_deducted" integer DEFAULT 0 NOT NULL,
	"sms_notified" boolean DEFAULT false NOT NULL,
	"sms_result" jsonb,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "floorplan_attr_defs" (
	"plan_id" uuid NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"owner_system" text DEFAULT 'floorplan' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"render_hint" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floorplan_attr_defs_plan_id_key_pk" PRIMARY KEY("plan_id","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "floorplan_cell_attrs" (
	"plan_id" uuid NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "floorplan_cell_attrs_plan_id_x_y_key_pk" PRIMARY KEY("plan_id","x","y","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "floorplan_cell_count_cache" (
	"plan_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"cells" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floorplan_cell_count_cache_plan_id_key_value_pk" PRIMARY KEY("plan_id","key","value")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "floorplan_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"join_attr" text NOT NULL,
	"caps" jsonb NOT NULL,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "floorplan_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"grid_w" integer DEFAULT 200 NOT NULL,
	"grid_h" integer DEFAULT 200 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "floorplan_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor_ids" jsonb NOT NULL,
	"color" text DEFAULT '#7C3AED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floorplan_pools_plan_id_name_unique" UNIQUE("plan_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "floorplan_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"cells" jsonb NOT NULL,
	"attr_rows" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gamification_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"is_auto_assigned" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid,
	CONSTRAINT "group_members_group_id_user_id_unique" UNIQUE("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"conversation_id" uuid NOT NULL,
	"linked_user_type_id" uuid,
	"is_auto_synced" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT '#6B7280',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_conversation_id_unique" UNIQUE("conversation_id"),
	CONSTRAINT "groups_linked_user_type_id_unique" UNIQUE("linked_user_type_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "info_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_drop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"item_description" text NOT NULL,
	"suggested_price" numeric(10, 2),
	"confidence_score" numeric(3, 2),
	"source_photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_decision_id" uuid,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_drop_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"description" text NOT NULL,
	"pick_notes" text,
	"status" "inventory_drop_status" DEFAULT 'pending' NOT NULL,
	"upload_status" "inventory_drop_upload_status" DEFAULT 'pending' NOT NULL,
	"photos_total" integer DEFAULT 0 NOT NULL,
	"photos_uploaded" integer DEFAULT 0 NOT NULL,
	"upload_error" text,
	"item_count" integer DEFAULT 0,
	"processing_error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"finalize_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kit_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"kit_id" text,
	"owner_type" text DEFAULT 'vendor_byo' NOT NULL,
	"printer_model" text NOT NULL,
	"printer_dpi" integer NOT NULL,
	"label_width_dots" integer NOT NULL,
	"label_height_dots" integer NOT NULL,
	"command_lang" text DEFAULT 'zpl2' NOT NULL,
	"media_sensor" text DEFAULT 'gap' NOT NULL,
	"media_type" text DEFAULT 'direct_thermal' NOT NULL,
	"backend" text NOT NULL,
	"preferred_format_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kit_profiles_vendor_kit_unique" UNIQUE NULLS NOT DISTINCT("vendor_id","kit_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "label_formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"layout" text NOT NULL,
	"label_width_inches" numeric(5, 3) NOT NULL,
	"label_height_inches" numeric(5, 3) NOT NULL,
	"page_width_inches" numeric(5, 3),
	"page_height_inches" numeric(5, 3),
	"cols" integer,
	"rows" integer,
	"margin_top_inches" numeric(5, 3),
	"margin_left_inches" numeric(5, 3),
	"vertical_pitch_inches" numeric(5, 3),
	"horizontal_pitch_inches" numeric(5, 3),
	"media_shape" text DEFAULT 'rectangle' NOT NULL,
	"shape_dims_json" jsonb,
	"media_sensor" text,
	"category" text DEFAULT 'sheet' NOT NULL,
	"manufacturer" text DEFAULT 'custom' NOT NULL,
	"part_number" text,
	"dpi" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "label_formats_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "late_arrival_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"warning_type" "late_arrival_warning_type" NOT NULL,
	"shift_start_time" timestamp with time zone NOT NULL,
	"minutes_late" integer NOT NULL,
	"sms_result" jsonb,
	"escalated_to_demerit" boolean DEFAULT false NOT NULL,
	"demerit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"ip_address" text NOT NULL,
	"user_agent" text,
	"result" "login_attempt_result" NOT NULL,
	"failure_reason" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"original_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid,
	"content" text NOT NULL,
	"is_system_message" boolean DEFAULT false NOT NULL,
	"parent_message_id" uuid,
	"thread_reply_count" integer DEFAULT 0 NOT NULL,
	"last_thread_reply_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metric_types" text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	"sync_interval_minutes" integer DEFAULT 60,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_data_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_type" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"unit" text,
	"aggregation" "metric_aggregation" DEFAULT 'sum' NOT NULL,
	"available_dimensions" text[] NOT NULL,
	"source_types" text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_definitions_metric_type_unique" UNIQUE("metric_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_import_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_source_id" uuid,
	"source_name" text NOT NULL,
	"import_type" text NOT NULL,
	"status" text NOT NULL,
	"metrics_imported" integer DEFAULT 0 NOT NULL,
	"metrics_skipped" integer DEFAULT 0 NOT NULL,
	"metrics_errored" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"error_details" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_type" text NOT NULL,
	"metric_key" text NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"period_type" "metric_period_type" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"source" "metric_source" NOT NULL,
	"source_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"data" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nrs_inventory_api_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid,
	"pending_change_id" uuid,
	"triggered_by_user_id" uuid,
	"action" "inventory_change_type" NOT NULL,
	"endpoint" text NOT NULL,
	"part_number" text,
	"nrs_vendor_id" integer,
	"nrs_part_id" integer,
	"request_payload" jsonb,
	"response_body" jsonb,
	"http_status" integer,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "office_manager_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"summary" text,
	"topics" jsonb DEFAULT '[]'::jsonb,
	"actions_performed" jsonb DEFAULT '[]'::jsonb,
	"channel" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "office_manager_pending_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"tool_args" jsonb NOT NULL,
	"confirmation_message" text NOT NULL,
	"status" "pending_action_status" DEFAULT 'pending' NOT NULL,
	"requires_pin" boolean DEFAULT false NOT NULL,
	"pin_attempts" integer DEFAULT 0 NOT NULL,
	"execution_result" jsonb,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pending_inventory_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"change_type" "inventory_change_type" NOT NULL,
	"nrs_part_id" integer,
	"part_number" text NOT NULL,
	"payload" jsonb NOT NULL,
	"previous_payload" jsonb,
	"status" "inventory_change_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"applied_by_user_id" uuid,
	"rejection_reason" text,
	"nrs_apply_notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permission_change_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"temporary_permission_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"notification_type" text NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"delivery_method" text DEFAULT 'in_app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_pattern" text NOT NULL,
	"action_name" text,
	"name" text NOT NULL,
	"description" text,
	"module" text NOT NULL,
	"is_auto_discovered" boolean DEFAULT false NOT NULL,
	"default_granted" boolean DEFAULT false NOT NULL,
	"requires_role" "user_role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_route_pattern_action_name_unique" UNIQUE("route_pattern","action_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "point_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"category" "point_category" NOT NULL,
	"action" text NOT NULL,
	"description" text,
	"multiplier" numeric(3, 2) DEFAULT '1.00',
	"base_points" integer NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"metadata" jsonb,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_decision_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pricing_decision_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_description" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"price_justification" text NOT NULL,
	"destination" "pricing_destination" DEFAULT 'store' NOT NULL,
	"ebay_reason" text,
	"ebay_task_id" uuid,
	"location_id" uuid,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"address" text,
	"priced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pricing_decision_id" uuid NOT NULL,
	"graded_by" uuid NOT NULL,
	"price_accuracy" integer NOT NULL,
	"justification_quality" integer NOT NULL,
	"photo_quality" integer NOT NULL,
	"overall_grade" numeric(3, 2) NOT NULL,
	"feedback" text,
	"points_awarded" integer NOT NULL,
	"graded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_grades_pricing_decision_id_unique" UNIQUE("pricing_decision_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "printers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'shop_network' NOT NULL,
	"model" text,
	"dpi" integer,
	"network_address" text,
	"mac_address" text,
	"serial" text,
	"location" text,
	"assigned_vendor_id" uuid,
	"command_lang" text DEFAULT 'zpl2' NOT NULL,
	"preferred_format_code" text,
	"last_seen_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"requester_id" uuid NOT NULL,
	"description" text NOT NULL,
	"proposed_price" numeric(10, 2) NOT NULL,
	"seller_info" text,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"address" text,
	"status" "purchase_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"device_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sale_date" date NOT NULL,
	"total_sales" numeric(12, 2) NOT NULL,
	"total_vendor_amount" numeric(12, 2) NOT NULL,
	"total_retained" numeric(12, 2) NOT NULL,
	"vendor_count" integer NOT NULL,
	"vendors" jsonb NOT NULL,
	"source" text DEFAULT 'scraper',
	"ai_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ar_cash_reg_id" integer NOT NULL,
	"ar_cash_reg_detail_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"store_name" text,
	"invoice_date" date NOT NULL,
	"create_date_time" timestamp with time zone NOT NULL,
	"vendor_id" integer NOT NULL,
	"vendor_name" text,
	"part_id" integer,
	"part_number" text,
	"part_name" text,
	"item_description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0',
	"discount_amount" numeric(12, 2) DEFAULT '0',
	"vendor_portion" numeric(12, 2) NOT NULL,
	"retained_amount" numeric(12, 2) NOT NULL,
	"user_name" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_template_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_fingerprint" text,
	"ip_address" text,
	"user_agent" text,
	"last_active" timestamp with time zone DEFAULT now() NOT NULL,
	"last_2fa_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shift_request_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "shift_response_status" NOT NULL,
	"note" text,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_request_responses_request_id_user_id_unique" UNIQUE("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shift_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"requested_date" date NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"location_id" uuid,
	"status" "shift_request_status" DEFAULT 'open' NOT NULL,
	"filled_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"notes" text,
	"created_by" uuid,
	"template_id" uuid,
	"template_shift_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shoutouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"nominator_id" uuid,
	"approved_by_id" uuid,
	"award_type_id" uuid,
	"category" "shoutout_category" DEFAULT 'general' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_manager_award" boolean DEFAULT false NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"status" "shoutout_status" DEFAULT 'pending' NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"rejection_reason" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sms_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_sid" text,
	"direction" "sms_direction" NOT NULL,
	"status" "sms_status" NOT NULL,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"body" text,
	"user_id" uuid,
	"error_code" text,
	"error_message" text,
	"segments" integer,
	"price" text,
	"status_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_logs_message_sid_unique" UNIQUE("message_sid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_media_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"platform" "social_media_platform" NOT NULL,
	"fields" jsonb NOT NULL,
	"require_url" boolean DEFAULT true NOT NULL,
	"require_screenshot" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_media_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"config_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"post_url" text NOT NULL,
	"values" jsonb NOT NULL,
	"notes" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_media_task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"config_id" uuid NOT NULL,
	"post_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_user_id" uuid,
	"recipient_group" text,
	"recipient_user_id" uuid,
	"body" text,
	"photo_path" text,
	"photo_original_name" text,
	"photo_mime_type" text,
	"photo_size_bytes" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_by_user_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staffing_level_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now(),
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"worker_count" integer NOT NULL,
	"days_observed" integer DEFAULT 0,
	"avg_total_hours" numeric(10, 2),
	"avg_daily_sales" numeric(12, 2),
	"min_daily_sales" numeric(12, 2),
	"max_daily_sales" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "staffing_level_metrics_worker_count_period_start_period_end_unique" UNIQUE("worker_count","period_start","period_end")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" text,
	"close_time" text,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_assignment_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"cash_count_config_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" "rule_trigger_type" NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" jsonb,
	"assignment_type" "assignment_type" NOT NULL,
	"assignment_config" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"completed_by" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"address" text,
	"cancelled_by_office_manager" boolean DEFAULT false,
	"cancellation_reason" text,
	"counts_as_missed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"task_completion_id" uuid,
	"file_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"steps" jsonb,
	"photo_required" boolean DEFAULT false NOT NULL,
	"notes_required" boolean DEFAULT false NOT NULL,
	"recurrence_rule" jsonb,
	"trigger_event" "trigger_event",
	"trigger_conditions" jsonb,
	"location_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assigned_to" uuid,
	"assignment_type" "task_assignment_type" DEFAULT 'individual' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"due_at" timestamp with time zone,
	"status" "task_status" DEFAULT 'not_started' NOT NULL,
	"photo_required" boolean DEFAULT false NOT NULL,
	"notes_required" boolean DEFAULT false NOT NULL,
	"source" "task_source" DEFAULT 'manual' NOT NULL,
	"linked_event_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "temporary_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"permission_id" uuid,
	"original_user_type_id" uuid,
	"new_user_type_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"granted_by_user_id" uuid,
	"granted_by_ai_run_id" uuid,
	"justification" text NOT NULL,
	"approval_status" text DEFAULT 'auto_approved' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"rolled_back_at" timestamp with time zone,
	"rolled_back_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thread_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_participants_message_id_user_id_unique" UNIQUE("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"shift_id" uuid,
	"location_id" uuid,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_in_lat" numeric(10, 7),
	"clock_in_lng" numeric(10, 7),
	"clock_in_address" text,
	"clock_out" timestamp with time zone,
	"clock_out_lat" numeric(10, 7),
	"clock_out_lng" numeric(10, 7),
	"clock_out_address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "two_factor_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "user_achievements_user_id_achievement_id_unique" UNIQUE("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_extra_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_extra_roles_pk" UNIQUE("user_id","role")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_migration_backup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"original_role" text NOT NULL,
	"original_user_type_id" uuid,
	"migrated_user_type_id" uuid,
	"migrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverted_at" timestamp with time zone,
	"migration_batch" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"weekly_points" integer DEFAULT 0 NOT NULL,
	"monthly_points" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"level_progress" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_streak_date" date,
	"attendance_points" integer DEFAULT 0 NOT NULL,
	"task_points" integer DEFAULT 0 NOT NULL,
	"pricing_points" integer DEFAULT 0 NOT NULL,
	"sales_points" integer DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"tasks_on_time" integer DEFAULT 0 NOT NULL,
	"pricing_decisions" integer DEFAULT 0 NOT NULL,
	"avg_pricing_grade" numeric(3, 2),
	"on_time_rate" numeric(5, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_stats_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_type_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_type_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_type_permissions_user_type_id_permission_id_unique" UNIQUE("user_type_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"based_on_role" "user_role",
	"priority" integer DEFAULT 50 NOT NULL,
	"color" text DEFAULT '#6B7280',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_visibility_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"data_category" "visibility_category" NOT NULL,
	"target_user_id" uuid,
	"target_group_id" uuid,
	"target_role" "user_role",
	"grant_type" "visibility_grant_type" DEFAULT 'view' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by_user_id" uuid,
	"reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"pin_hash" text NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	"user_type_id" uuid,
	"primary_location_id" uuid,
	"name" text NOT NULL,
	"phone" text,
	"avatar_url" text,
	"hourly_rate" numeric(10, 2),
	"two_factor_enabled" boolean DEFAULT true NOT NULL,
	"can_list_on_ebay" boolean DEFAULT false NOT NULL,
	"include_in_labor_cost" boolean DEFAULT true NOT NULL,
	"sms_locked_until" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"status" "vendor_agreement_status" DEFAULT 'signed' NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_by_name" text NOT NULL,
	"signature_data_url" text,
	"paper_original_on_file" boolean DEFAULT false NOT NULL,
	"signed_document_path" text,
	"signed_document_original_name" text,
	"signed_document_mime_type" text,
	"signed_document_size_bytes" integer,
	"signed_document_uploaded_at" timestamp with time zone,
	"signed_document_uploaded_by_user_id" uuid,
	"body_snapshot" text NOT NULL,
	"template_version" integer NOT NULL,
	"terms_snapshot" jsonb NOT NULL,
	"witnessed_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_employee_correlations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor_id" text NOT NULL,
	"vendor_name" text NOT NULL,
	"period_type" "metric_period_type" NOT NULL,
	"period_start" date NOT NULL,
	"shifts_count" integer DEFAULT 0 NOT NULL,
	"hours_worked" numeric(8, 2) DEFAULT '0' NOT NULL,
	"vendor_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vendor_retained" numeric(12, 2) DEFAULT '0' NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"avg_vendor_sales_overall" numeric(12, 2),
	"sales_delta_pct" numeric(8, 4),
	"sample_size" integer DEFAULT 0 NOT NULL,
	"confidence_score" numeric(5, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_employee_correlations_user_id_vendor_id_period_type_period_start_unique" UNIQUE("user_id","vendor_id","period_type","period_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_group_members" (
	"vendor_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_group_members_pk" UNIQUE("vendor_id","group_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "vendor_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_newsletter_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"newsletter_id" uuid NOT NULL,
	"vendor_id" uuid,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_newsletters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subject" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "vendor_newsletter_status" DEFAULT 'draft' NOT NULL,
	"publish_to_portal" boolean DEFAULT true NOT NULL,
	"scheduled_send_at" timestamp with time zone,
	"recurrence" text,
	"sent_at" timestamp with time zone,
	"sent_by_user_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_partnumber_sequences" (
	"vendor_id" uuid NOT NULL,
	"date_str" text NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_partnumber_sequences_pk" UNIQUE("vendor_id","date_str")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"part_number" text NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"description" text,
	"price_cents" integer,
	"source" text DEFAULT 'web_portal' NOT NULL,
	"status" "print_job_status" DEFAULT 'queued' NOT NULL,
	"pending_change_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"printed_at" timestamp with time zone,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_tag_settings" (
	"vendor_id" uuid PRIMARY KEY NOT NULL,
	"header_line" text,
	"footer_line" text,
	"include_description" boolean DEFAULT true NOT NULL,
	"include_part_number" boolean DEFAULT true NOT NULL,
	"include_price" boolean DEFAULT true NOT NULL,
	"include_barcode" boolean DEFAULT true NOT NULL,
	"barcode_symbology" text DEFAULT 'code_128' NOT NULL,
	"preferred_format" text DEFAULT 'avery_5160' NOT NULL,
	"zebra_dpi" integer DEFAULT 203 NOT NULL,
	"font_scale" "tag_font_scale" DEFAULT 'medium' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nrs_vendor_id" integer,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"state" text,
	"zip" text,
	"booth_number" text,
	"monthly_rent_cents" integer,
	"max_discount_percent" numeric(5, 2),
	"vendor_payment_percent" numeric(5, 2),
	"status" "vendor_status" DEFAULT 'inactive' NOT NULL,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"inventory_code_prefix" text,
	"portal_enabled" boolean DEFAULT false NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"nrs_inactive" boolean DEFAULT false NOT NULL,
	"credentials_sent_at" timestamp with time zone,
	"credentials_sent_via" text,
	"credentials_sent_by_user_id" uuid,
	"nrs_ar_customer_id" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_nrs_vendor_id_unique" UNIQUE("nrs_vendor_id"),
	CONSTRAINT "vendors_inventory_code_prefix_unique" UNIQUE("inventory_code_prefix")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visibility_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid,
	"is_leader" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visibility_group_members_group_id_user_id_unique" UNIQUE("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visibility_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"group_type" "visibility_group_type" DEFAULT 'team' NOT NULL,
	"location_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visibility_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visibility_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rules" jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visibility_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "visibility_category" NOT NULL,
	"viewer_role" "user_role",
	"viewer_group_id" uuid,
	"target_role" "user_role",
	"target_group_id" uuid,
	"visibility_level" "visibility_level" DEFAULT 'none' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visibility_rules_rule_key_unique" UNIQUE("rule_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawal_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"withdrawal_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"product_description" text,
	"purchase_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_impact_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now(),
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"user_id" uuid NOT NULL,
	"total_hours_worked" numeric(10, 2) DEFAULT '0',
	"total_attributed_sales" numeric(12, 2) DEFAULT '0',
	"sales_per_hour" numeric(10, 2) DEFAULT '0',
	"days_worked" integer DEFAULT 0,
	"avg_sales_when_present" numeric(12, 2),
	"avg_sales_when_absent" numeric(12, 2),
	"sales_impact" numeric(12, 2),
	"impact_confidence" numeric(5, 4),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "worker_impact_metrics_user_id_period_start_period_end_unique" UNIQUE("user_id","period_start","period_end")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_pair_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now(),
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"user_id_1" uuid NOT NULL,
	"user_id_2" uuid NOT NULL,
	"days_together" integer DEFAULT 0 NOT NULL,
	"total_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
	"avg_daily_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "worker_pair_performance_user_id_1_user_id_2_period_start_period_end_unique" UNIQUE("user_id_1","user_id_2","period_start","period_end")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agreement_templates_code" ON "agreement_templates" ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agreement_templates_kind_active" ON "agreement_templates" ("kind","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "break_entries_time_entry_id_idx" ON "break_entries" ("time_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "break_entries_user_id_idx" ON "break_entries" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "floorplan_cell_attrs_plan_key_value_idx" ON "floorplan_cell_attrs" ("plan_id","key","value");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages" ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nrs_inv_api_log_vendor" ON "nrs_inventory_api_log" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nrs_inv_api_log_created" ON "nrs_inventory_api_log" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nrs_inv_api_log_success" ON "nrs_inventory_api_log" ("success");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "office_manager_chats_user_channel_idx" ON "office_manager_chats" ("user_id","channel","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user" ON "password_reset_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_inventory_changes_vendor" ON "pending_inventory_changes" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_inventory_changes_status" ON "pending_inventory_changes" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_inventory_changes_vendor_status" ON "pending_inventory_changes" ("vendor_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_template_shifts_template_id_idx" ON "schedule_template_shifts" ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_template_shifts_day_idx" ON "schedule_template_shifts" ("template_id","day_of_week");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_template_shifts_user_idx" ON "schedule_template_shifts" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_templates_is_default_idx" ON "schedule_templates" ("is_default");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_logs_user_id_idx" ON "sms_logs" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_user_id_idx" ON "time_entries" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_phone_idx" ON "users" ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_agreements_vendor" ON "vendor_agreements" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_agreements_vendor_template_status" ON "vendor_agreements" ("vendor_id","template_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_newsletter_sends_newsletter" ON "vendor_newsletter_sends" ("newsletter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendor_print_jobs_vendor_status" ON "vendor_print_jobs" ("vendor_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendors_status" ON "vendors" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendors_nrs_vendor_id" ON "vendors" ("nrs_vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendors_onboarding" ON "vendors" ("onboarding_complete");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_lockouts" ADD CONSTRAINT "account_lockouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_lockouts" ADD CONSTRAINT "account_lockouts_unlocked_by_users_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agreement_templates" ADD CONSTRAINT "agreement_templates_supersedes_id_agreement_templates_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "agreement_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agreement_templates" ADD CONSTRAINT "agreement_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_created_task_id_tasks_id_fk" FOREIGN KEY ("created_task_id") REFERENCES "tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_created_message_id_messages_id_fk" FOREIGN KEY ("created_message_id") REFERENCES "messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_cooldowns" ADD CONSTRAINT "ai_cooldowns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_cooldowns" ADD CONSTRAINT "ai_cooldowns_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "ai_actions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_policy_notes" ADD CONSTRAINT "ai_policy_notes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_policy_notes" ADD CONSTRAINT "ai_policy_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "allocation_photos" ADD CONSTRAINT "allocation_photos_allocation_id_withdrawal_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "withdrawal_allocations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "architecture_chats" ADD CONSTRAINT "architecture_chats_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "architecture_decisions" ADD CONSTRAINT "architecture_decisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "atm_withdrawals" ADD CONSTRAINT "atm_withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "break_entries" ADD CONSTRAINT "break_entries_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "break_entries" ADD CONSTRAINT "break_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_count_configs" ADD CONSTRAINT "cash_count_configs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_count_configs" ADD CONSTRAINT "cash_count_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_count_task_links" ADD CONSTRAINT "cash_count_task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_count_task_links" ADD CONSTRAINT "cash_count_task_links_config_id_cash_count_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "cash_count_configs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_count_task_links" ADD CONSTRAINT "cash_count_task_links_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_config_id_cash_count_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "cash_count_configs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clock_out_warnings" ADD CONSTRAINT "clock_out_warnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clock_out_warnings" ADD CONSTRAINT "clock_out_warnings_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clock_out_warnings" ADD CONSTRAINT "clock_out_warnings_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clock_out_warnings" ADD CONSTRAINT "clock_out_warnings_demerit_id_demerits_id_fk" FOREIGN KEY ("demerit_id") REFERENCES "demerits"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_holds" ADD CONSTRAINT "customer_holds_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_holds" ADD CONSTRAINT "customer_holds_cleared_by_user_id_users_id_fk" FOREIGN KEY ("cleared_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demerits" ADD CONSTRAINT "demerits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demerits" ADD CONSTRAINT "demerits_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "floorplan_attr_defs" ADD CONSTRAINT "floorplan_attr_defs_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "floorplan_cell_attrs" ADD CONSTRAINT "floorplan_cell_attrs_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "floorplan_cell_count_cache" ADD CONSTRAINT "floorplan_cell_count_cache_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "floorplan_connectors" ADD CONSTRAINT "floorplan_connectors_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "floorplan_pools" ADD CONSTRAINT "floorplan_pools_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "floorplan_snapshots" ADD CONSTRAINT "floorplan_snapshots_plan_id_floorplan_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "floorplan_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "floorplan_snapshots" ADD CONSTRAINT "floorplan_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_members" ADD CONSTRAINT "group_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "groups" ADD CONSTRAINT "groups_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "groups" ADD CONSTRAINT "groups_linked_user_type_id_user_types_id_fk" FOREIGN KEY ("linked_user_type_id") REFERENCES "user_types"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "info_posts" ADD CONSTRAINT "info_posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_drop_items" ADD CONSTRAINT "inventory_drop_items_drop_id_inventory_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "inventory_drops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_drop_items" ADD CONSTRAINT "inventory_drop_items_pricing_decision_id_pricing_decisions_id_fk" FOREIGN KEY ("pricing_decision_id") REFERENCES "pricing_decisions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_drop_photos" ADD CONSTRAINT "inventory_drop_photos_drop_id_inventory_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "inventory_drops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_drops" ADD CONSTRAINT "inventory_drops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_drops" ADD CONSTRAINT "inventory_drops_finalize_task_id_tasks_id_fk" FOREIGN KEY ("finalize_task_id") REFERENCES "tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kit_profiles" ADD CONSTRAINT "kit_profiles_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "late_arrival_warnings" ADD CONSTRAINT "late_arrival_warnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "late_arrival_warnings" ADD CONSTRAINT "late_arrival_warnings_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "late_arrival_warnings" ADD CONSTRAINT "late_arrival_warnings_demerit_id_demerits_id_fk" FOREIGN KEY ("demerit_id") REFERENCES "demerits"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_photos" ADD CONSTRAINT "message_photos_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_import_history" ADD CONSTRAINT "metric_import_history_data_source_id_metric_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "metric_data_sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nrs_inventory_api_log" ADD CONSTRAINT "nrs_inventory_api_log_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nrs_inventory_api_log" ADD CONSTRAINT "nrs_inventory_api_log_pending_change_id_pending_inventory_changes_id_fk" FOREIGN KEY ("pending_change_id") REFERENCES "pending_inventory_changes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nrs_inventory_api_log" ADD CONSTRAINT "nrs_inventory_api_log_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "office_manager_chats" ADD CONSTRAINT "office_manager_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "office_manager_pending_actions" ADD CONSTRAINT "office_manager_pending_actions_chat_id_office_manager_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "office_manager_chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_inventory_changes" ADD CONSTRAINT "pending_inventory_changes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_inventory_changes" ADD CONSTRAINT "pending_inventory_changes_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_inventory_changes" ADD CONSTRAINT "pending_inventory_changes_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_inventory_changes" ADD CONSTRAINT "pending_inventory_changes_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "permission_change_notifications" ADD CONSTRAINT "permission_change_notifications_temporary_permission_id_temporary_permissions_id_fk" FOREIGN KEY ("temporary_permission_id") REFERENCES "temporary_permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "permission_change_notifications" ADD CONSTRAINT "permission_change_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_decision_photos" ADD CONSTRAINT "pricing_decision_photos_pricing_decision_id_pricing_decisions_id_fk" FOREIGN KEY ("pricing_decision_id") REFERENCES "pricing_decisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_decisions" ADD CONSTRAINT "pricing_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_decisions" ADD CONSTRAINT "pricing_decisions_ebay_task_id_tasks_id_fk" FOREIGN KEY ("ebay_task_id") REFERENCES "tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_decisions" ADD CONSTRAINT "pricing_decisions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_grades" ADD CONSTRAINT "pricing_grades_pricing_decision_id_pricing_decisions_id_fk" FOREIGN KEY ("pricing_decision_id") REFERENCES "pricing_decisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_grades" ADD CONSTRAINT "pricing_grades_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "printers" ADD CONSTRAINT "printers_assigned_vendor_id_vendors_id_fk" FOREIGN KEY ("assigned_vendor_id") REFERENCES "vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_template_id_schedule_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "schedule_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_request_responses" ADD CONSTRAINT "shift_request_responses_request_id_shift_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "shift_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_request_responses" ADD CONSTRAINT "shift_request_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_filled_by_users_id_fk" FOREIGN KEY ("filled_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_template_id_schedule_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "schedule_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_template_shift_id_schedule_template_shifts_id_fk" FOREIGN KEY ("template_shift_id") REFERENCES "schedule_template_shifts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shoutouts" ADD CONSTRAINT "shoutouts_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shoutouts" ADD CONSTRAINT "shoutouts_nominator_id_users_id_fk" FOREIGN KEY ("nominator_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shoutouts" ADD CONSTRAINT "shoutouts_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shoutouts" ADD CONSTRAINT "shoutouts_award_type_id_award_types_id_fk" FOREIGN KEY ("award_type_id") REFERENCES "award_types"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_media_configs" ADD CONSTRAINT "social_media_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_media_submissions" ADD CONSTRAINT "social_media_submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_media_submissions" ADD CONSTRAINT "social_media_submissions_config_id_social_media_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "social_media_configs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_media_submissions" ADD CONSTRAINT "social_media_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_media_task_links" ADD CONSTRAINT "social_media_task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_media_task_links" ADD CONSTRAINT "social_media_task_links_config_id_social_media_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "social_media_configs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_assignment_rules" ADD CONSTRAINT "task_assignment_rules_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_assignment_rules" ADD CONSTRAINT "task_assignment_rules_cash_count_config_id_cash_count_configs_id_fk" FOREIGN KEY ("cash_count_config_id") REFERENCES "cash_count_configs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_assignment_rules" ADD CONSTRAINT "task_assignment_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_task_completion_id_task_completions_id_fk" FOREIGN KEY ("task_completion_id") REFERENCES "task_completions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_original_user_type_id_user_types_id_fk" FOREIGN KEY ("original_user_type_id") REFERENCES "user_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_new_user_type_id_user_types_id_fk" FOREIGN KEY ("new_user_type_id") REFERENCES "user_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "temporary_permissions" ADD CONSTRAINT "temporary_permissions_rolled_back_by_user_id_users_id_fk" FOREIGN KEY ("rolled_back_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "two_factor_codes" ADD CONSTRAINT "two_factor_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_extra_roles" ADD CONSTRAINT "user_extra_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_migration_backup" ADD CONSTRAINT "user_migration_backup_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_migration_backup" ADD CONSTRAINT "user_migration_backup_migrated_user_type_id_user_types_id_fk" FOREIGN KEY ("migrated_user_type_id") REFERENCES "user_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_type_permissions" ADD CONSTRAINT "user_type_permissions_user_type_id_user_types_id_fk" FOREIGN KEY ("user_type_id") REFERENCES "user_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_type_permissions" ADD CONSTRAINT "user_type_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_visibility_grants" ADD CONSTRAINT "user_visibility_grants_target_group_id_visibility_groups_id_fk" FOREIGN KEY ("target_group_id") REFERENCES "visibility_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_user_type_id_user_types_id_fk" FOREIGN KEY ("user_type_id") REFERENCES "user_types"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_primary_location_id_locations_id_fk" FOREIGN KEY ("primary_location_id") REFERENCES "locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_agreements" ADD CONSTRAINT "vendor_agreements_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_agreements" ADD CONSTRAINT "vendor_agreements_template_id_agreement_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "agreement_templates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_agreements" ADD CONSTRAINT "vendor_agreements_signed_document_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("signed_document_uploaded_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_agreements" ADD CONSTRAINT "vendor_agreements_witnessed_by_user_id_users_id_fk" FOREIGN KEY ("witnessed_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_announcements" ADD CONSTRAINT "vendor_announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_employee_correlations" ADD CONSTRAINT "vendor_employee_correlations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_group_members" ADD CONSTRAINT "vendor_group_members_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_group_members" ADD CONSTRAINT "vendor_group_members_group_id_vendor_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "vendor_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_groups" ADD CONSTRAINT "vendor_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_newsletter_sends" ADD CONSTRAINT "vendor_newsletter_sends_newsletter_id_vendor_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "vendor_newsletters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_newsletter_sends" ADD CONSTRAINT "vendor_newsletter_sends_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_newsletters" ADD CONSTRAINT "vendor_newsletters_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_newsletters" ADD CONSTRAINT "vendor_newsletters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_partnumber_sequences" ADD CONSTRAINT "vendor_partnumber_sequences_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_print_jobs" ADD CONSTRAINT "vendor_print_jobs_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_print_jobs" ADD CONSTRAINT "vendor_print_jobs_pending_change_id_pending_inventory_changes_id_fk" FOREIGN KEY ("pending_change_id") REFERENCES "pending_inventory_changes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_print_jobs" ADD CONSTRAINT "vendor_print_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_tag_settings" ADD CONSTRAINT "vendor_tag_settings_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendors" ADD CONSTRAINT "vendors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendors" ADD CONSTRAINT "vendors_credentials_sent_by_user_id_users_id_fk" FOREIGN KEY ("credentials_sent_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visibility_group_members" ADD CONSTRAINT "visibility_group_members_group_id_visibility_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "visibility_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visibility_rules" ADD CONSTRAINT "visibility_rules_viewer_group_id_visibility_groups_id_fk" FOREIGN KEY ("viewer_group_id") REFERENCES "visibility_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visibility_rules" ADD CONSTRAINT "visibility_rules_target_group_id_visibility_groups_id_fk" FOREIGN KEY ("target_group_id") REFERENCES "visibility_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_allocations" ADD CONSTRAINT "withdrawal_allocations_withdrawal_id_atm_withdrawals_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "atm_withdrawals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_allocations" ADD CONSTRAINT "withdrawal_allocations_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_impact_metrics" ADD CONSTRAINT "worker_impact_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_pair_performance" ADD CONSTRAINT "worker_pair_performance_user_id_1_users_id_fk" FOREIGN KEY ("user_id_1") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_pair_performance" ADD CONSTRAINT "worker_pair_performance_user_id_2_users_id_fk" FOREIGN KEY ("user_id_2") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
