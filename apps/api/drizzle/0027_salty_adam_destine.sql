CREATE TABLE "shipping_incidents" (
	"id" integer PRIMARY KEY NOT NULL,
	"pre_shipment_number" varchar(64) NOT NULL,
	"order_id" uuid,
	"description" text NOT NULL,
	"observations" text,
	"response" text,
	"response_status" varchar(16) DEFAULT 'open' NOT NULL,
	"author" varchar(64),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "shipping_incidents" ADD CONSTRAINT "shipping_incidents_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;