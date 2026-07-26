DO $$ BEGIN
 CREATE TYPE "consignor_type" AS ENUM('vendor', 'estate', 'walkin', 'house');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "ebay_settlement_status" AS ENUM('pending', 'approved', 'exported');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "lister_comp_type" AS ENUM('commission', 'points', 'none');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consignment_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consignor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"consignor_percent" numeric(5, 2) NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consignment_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consignors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "consignor_type" DEFAULT 'walkin' NOT NULL,
	"name" text NOT NULL,
	"vendor_user_id" uuid,
	"phone" text,
	"email" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ebay_lister_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"comp_type" "lister_comp_type" DEFAULT 'none' NOT NULL,
	"commission_percent" numeric(5, 2),
	"points_per_dollar" numeric(6, 3) DEFAULT '1.000',
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ebay_sale_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listflow_sale_id" text NOT NULL,
	"ebay_order_id" text NOT NULL,
	"line_item_id" text DEFAULT '0' NOT NULL,
	"sales_record_number" text,
	"account" text NOT NULL,
	"title" text NOT NULL,
	"sku" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"basis" numeric(10, 2) NOT NULL,
	"sold_at" timestamp with time zone NOT NULL,
	"consignment_group_id" uuid,
	"consignor_id" uuid,
	"consignor_percent" numeric(5, 2),
	"consignor_amount" numeric(10, 2),
	"yf_amount" numeric(10, 2) NOT NULL,
	"lister_user_id" uuid,
	"lister_comp_type" "lister_comp_type",
	"lister_commission_percent" numeric(5, 2),
	"lister_commission_amount" numeric(10, 2),
	"points_awarded" integer,
	"point_transaction_id" uuid,
	"status" "ebay_settlement_status" DEFAULT 'pending' NOT NULL,
	"pay_period" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ebay_sale_settlements_listflow_sale_id_unique" UNIQUE("listflow_sale_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consignment_groups" ADD CONSTRAINT "consignment_groups_consignor_id_consignors_id_fk" FOREIGN KEY ("consignor_id") REFERENCES "consignors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consignors" ADD CONSTRAINT "consignors_vendor_user_id_users_id_fk" FOREIGN KEY ("vendor_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ebay_lister_settings" ADD CONSTRAINT "ebay_lister_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ebay_sale_settlements" ADD CONSTRAINT "ebay_sale_settlements_consignment_group_id_consignment_groups_id_fk" FOREIGN KEY ("consignment_group_id") REFERENCES "consignment_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ebay_sale_settlements" ADD CONSTRAINT "ebay_sale_settlements_consignor_id_consignors_id_fk" FOREIGN KEY ("consignor_id") REFERENCES "consignors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ebay_sale_settlements" ADD CONSTRAINT "ebay_sale_settlements_lister_user_id_users_id_fk" FOREIGN KEY ("lister_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
