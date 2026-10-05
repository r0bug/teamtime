DO $$ BEGIN
 CREATE TYPE "shift_recipient_delivery" AS ENUM('pending', 'sent', 'failed', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "shift_request_type" AS ENUM('sick', 'personal', 'appointment', 'trade', 'open_shift');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "shift_request_status" ADD VALUE IF NOT EXISTS 'pending_approval';--> statement-breakpoint
ALTER TYPE "shift_request_status" ADD VALUE IF NOT EXISTS 'expired';--> statement-breakpoint
ALTER TYPE "shift_request_status" ADD VALUE IF NOT EXISTS 'denied';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shift_request_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text,
	"delivery_status" "shift_recipient_delivery" DEFAULT 'pending' NOT NULL,
	"sms_log_id" uuid,
	"eligibility_notes" jsonb,
	"error_message" text,
	"reminded_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_request_recipients_unique" UNIQUE("request_id","user_id")
);
--> statement-breakpoint
-- NOTE: not part of shift coverage. Pre-existing snapshot drift that
-- db:generate swept into this file. The column already exists in production,
-- where `sessions` is owned by `postgres` rather than the app user — and PG
-- checks table ownership before IF NOT EXISTS, so a bare ALTER aborts the run.
-- Guard on existence so this is a no-op there and still applies on a fresh DB.
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM information_schema.columns
   WHERE table_name = 'sessions' AND column_name = 'context_vendor_id'
 ) THEN
   ALTER TABLE "sessions" ADD COLUMN "context_vendor_id" uuid;
 END IF;
END $$;--> statement-breakpoint
ALTER TABLE "shift_request_responses" ADD COLUMN IF NOT EXISTS "via_sms" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_request_responses" ADD COLUMN IF NOT EXISTS "sms_log_id" uuid;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "request_type" "shift_request_type" DEFAULT 'open_shift' NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "requested_by" uuid;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "reason" text;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "claim_code" text;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "respond_by" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "broadcast_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "broadcast_by" uuid;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "filled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "auto_apply" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "offered_shift_id" uuid;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN IF NOT EXISTS "manager_note" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_request_recipients_request_id_idx" ON "shift_request_recipients" ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_request_recipients_user_id_idx" ON "shift_request_recipients" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_requests_status_idx" ON "shift_requests" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_requests_claim_code_idx" ON "shift_requests" ("claim_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_requests_requested_by_idx" ON "shift_requests" ("requested_by");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_request_responses" ADD CONSTRAINT "shift_request_responses_sms_log_id_sms_logs_id_fk" FOREIGN KEY ("sms_log_id") REFERENCES "sms_logs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_broadcast_by_users_id_fk" FOREIGN KEY ("broadcast_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_offered_shift_id_shifts_id_fk" FOREIGN KEY ("offered_shift_id") REFERENCES "shifts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_request_recipients" ADD CONSTRAINT "shift_request_recipients_request_id_shift_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "shift_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_request_recipients" ADD CONSTRAINT "shift_request_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_request_recipients" ADD CONSTRAINT "shift_request_recipients_sms_log_id_sms_logs_id_fk" FOREIGN KEY ("sms_log_id") REFERENCES "sms_logs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
