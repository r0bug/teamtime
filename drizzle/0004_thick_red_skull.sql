ALTER TABLE "sms_logs" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD COLUMN "sent_by_user_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_logs_vendor_id_idx" ON "sms_logs" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_logs_thread_idx" ON "sms_logs" ("to_number","from_number","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
