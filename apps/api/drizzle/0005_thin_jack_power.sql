CREATE TABLE "whatsapp_inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whatsapp_message_id" varchar(128) NOT NULL,
	"business_phone_number_id" varchar(32) NOT NULL,
	"customer_phone" varchar(20) NOT NULL,
	"message_type" varchar(32) NOT NULL,
	"text_body" text,
	"received_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_inbound_messages_message_id_unique" UNIQUE("whatsapp_message_id")
);
--> statement-breakpoint
CREATE INDEX "whatsapp_inbound_messages_customer_received_idx" ON "whatsapp_inbound_messages" USING btree ("customer_phone","received_at");