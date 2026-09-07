CREATE TABLE "order_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"summary_version" integer NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_confirmations_order_unique" UNIQUE("order_id"),
	CONSTRAINT "order_confirmations_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "order_confirmations_summary_version_positive" CHECK ("order_confirmations"."summary_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"previous_status" varchar(16),
	"next_status" varchar(16) NOT NULL,
	"reason" varchar(250),
	"admin_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_status_events_next_status_allowed" CHECK ("order_status_events"."next_status" IN ('draft', 'confirmed', 'cancelled', 'dispatched', 'delivered', 'returned'))
);
--> statement-breakpoint
CREATE TABLE "order_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"draft_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_summaries_order_version_unique" UNIQUE("order_id","version"),
	CONSTRAINT "order_summaries_version_positive" CHECK ("order_summaries"."version" >= 1),
	CONSTRAINT "order_summaries_draft_version_positive" CHECK ("order_summaries"."draft_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "reservation_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"reference_id" uuid NOT NULL,
	"size" numeric(4, 1) NOT NULL,
	"previous_reserved_quantity" integer NOT NULL,
	"new_reserved_quantity" integer NOT NULL,
	"delta" integer NOT NULL,
	"reason" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_movements_delta_consistent" CHECK ("reservation_movements"."delta" = "reservation_movements"."new_reserved_quantity" - "reservation_movements"."previous_reserved_quantity"),
	CONSTRAINT "reservation_movements_quantities_non_negative" CHECK ("reservation_movements"."previous_reserved_quantity" >= 0 AND "reservation_movements"."new_reserved_quantity" >= 0),
	CONSTRAINT "reservation_movements_reason_allowed" CHECK ("reservation_movements"."reason" IN ('confirmed', 'cancelled', 'dispatched'))
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" bigint GENERATED ALWAYS AS IDENTITY (sequence name "sales_orders_order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"reference_id" uuid NOT NULL,
	"size" numeric(4, 1) NOT NULL,
	"quantity" integer NOT NULL,
	"customer_name" varchar(120),
	"customer_phone" varchar(13),
	"address" varchar(180),
	"locality_carrier_code" varchar(32),
	"locality_department" varchar(100),
	"locality_name" varchar(120),
	"delivery_notes" varchar(250),
	"draft_version" integer DEFAULT 1 NOT NULL,
	"latest_summary_version" integer DEFAULT 0 NOT NULL,
	"confirmed_summary_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "sales_orders_status_allowed" CHECK ("sales_orders"."status" IN ('draft', 'confirmed', 'cancelled', 'dispatched', 'delivered', 'returned')),
	CONSTRAINT "sales_orders_quantity_range" CHECK ("sales_orders"."quantity" BETWEEN 1 AND 10),
	CONSTRAINT "sales_orders_size_half_steps" CHECK (("sales_orders"."size" * 2) = trunc("sales_orders"."size" * 2)),
	CONSTRAINT "sales_orders_draft_version_positive" CHECK ("sales_orders"."draft_version" >= 1),
	CONSTRAINT "sales_orders_summary_versions_valid" CHECK ("sales_orders"."latest_summary_version" >= 0 AND ("sales_orders"."confirmed_summary_version" IS NULL OR "sales_orders"."confirmed_summary_version" >= 1))
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_allowed";--> statement-breakpoint
ALTER TABLE "order_confirmations" ADD CONSTRAINT "order_confirmations_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_summaries" ADD CONSTRAINT "order_summaries_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_reference_id_catalog_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."catalog_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_reference_id_catalog_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."catalog_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_status_events_order_created_at_idx" ON "order_status_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "reservation_movements_order_created_at_idx" ON "reservation_movements" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_orders_status_created_at_idx" ON "sales_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "sales_orders_reference_size_idx" ON "sales_orders" USING btree ("reference_id","size");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_allowed" CHECK ("inventory_movements"."reason" IN ('initial', 'manual_adjustment', 'order_dispatched', 'order_returned'));