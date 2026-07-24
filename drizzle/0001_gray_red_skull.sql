ALTER TABLE "users" ADD COLUMN "nrs_employee_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_nrs_employee_id_unique" UNIQUE("nrs_employee_id");