CREATE TABLE "shipping_guide_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"carrier" varchar(32) DEFAULT 'envia' NOT NULL,
	"pre_shipment_number" varchar(64),
	"freight_cop" integer,
	"error_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_guide_jobs_order_unique" UNIQUE("order_id"),
	CONSTRAINT "shipping_guide_jobs_status_allowed" CHECK ("shipping_guide_jobs"."status" IN ('pending', 'processing', 'created', 'uncertain', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD CONSTRAINT "shipping_guide_jobs_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipping_guide_jobs_status_created_idx" ON "shipping_guide_jobs" USING btree ("status","created_at");