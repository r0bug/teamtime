ALTER TABLE "ebay_sale_settlements" ADD COLUMN "fees" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "ebay_sale_settlements" ADD COLUMN "fee_source" text;--> statement-breakpoint
ALTER TABLE "ebay_sale_settlements" ADD COLUMN "net_basis" numeric(10, 2);