CREATE TABLE "whatsapp_outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"idempotency_key" varchar(160) NOT NULL,
	"customer_phone" varchar(20) NOT NULL,
	"message_type" varchar(16) NOT NULL,
	"text_body" text,
	"media_storage_key" varchar(255),
	"media_mime_type" varchar(32),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"whatsapp_message_id" varchar(128),
	"error_code" varchar(64),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_outbound_messages_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "whatsapp_outbound_messages_type_allowed" CHECK ("whatsapp_outbound_messages"."message_type" IN ('text', 'image')),
	CONSTRAINT "whatsapp_outbound_messages_status_allowed" CHECK ("whatsapp_outbound_messages"."status" IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
	CONSTRAINT "whatsapp_outbound_messages_attempt_non_negative" CHECK ("whatsapp_outbound_messages"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "whatsapp_outbound_messages" ADD CONSTRAINT "whatsapp_outbound_messages_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_outbound_messages_status_created_idx" ON "whatsapp_outbound_messages" USING btree ("status","created_at");