CREATE TABLE "shipping_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"draft_version" integer NOT NULL,
	"carrier" varchar(32) NOT NULL,
	"service_id" integer NOT NULL,
	"freight_cop" integer NOT NULL,
	"cash_on_delivery_cop" integer NOT NULL,
	"surcharge_cop" integer NOT NULL,
	"estimated_days" varchar(32) NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	CONSTRAINT "shipping_quotes_order_carrier_version_unique" UNIQUE("order_id","draft_version","carrier"),
	CONSTRAINT "shipping_quotes_draft_version_positive" CHECK ("shipping_quotes"."draft_version" >= 1),
	CONSTRAINT "shipping_quotes_cop_non_negative" CHECK ("shipping_quotes"."freight_cop" >= 0 AND "shipping_quotes"."cash_on_delivery_cop" >= 0 AND "shipping_quotes"."surcharge_cop" >= 0),
	CONSTRAINT "shipping_quotes_expiry_after_quote" CHECK ("shipping_quotes"."expires_at" > "shipping_quotes"."quoted_at")
);
--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD COLUMN "guide_pdf_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD COLUMN "guide_pdf_sha256" char(64);--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD COLUMN "guide_pdf_byte_size" integer;--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD COLUMN "guide_pdf_storage_key" varchar(255);--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_quotes_one_selected_per_order" ON "shipping_quotes" USING btree ("order_id") WHERE "shipping_quotes"."selected";--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD CONSTRAINT "shipping_guide_jobs_quote_id_shipping_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."shipping_quotes"("id") ON DELETE restrict ON UPDATE no action;