CREATE TABLE "whatsapp_conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"outbound_message_id" uuid,
	"provider_message_id" varchar(128),
	"source" varchar(16) NOT NULL,
	"message_type" varchar(16) NOT NULL,
	"text_body" text,
	"media_storage_key" varchar(255),
	"media_mime_type" varchar(32),
	"status" varchar(16) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_conversation_messages_provider_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "whatsapp_conversation_messages_outbound_unique" UNIQUE("outbound_message_id"),
	CONSTRAINT "whatsapp_conversation_messages_source_allowed" CHECK ("whatsapp_conversation_messages"."source" IN ('customer', 'bot', 'owner_panel', 'owner_mobile')),
	CONSTRAINT "whatsapp_conversation_messages_type_allowed" CHECK ("whatsapp_conversation_messages"."message_type" IN ('text', 'image', 'template', 'event')),
	CONSTRAINT "whatsapp_conversation_messages_status_allowed" CHECK ("whatsapp_conversation_messages"."status" IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" ADD CONSTRAINT "whatsapp_conversation_messages_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_messages_conversation_time_idx" ON "whatsapp_conversation_messages" USING btree ("conversation_id","occurred_at","id");
--> statement-breakpoint
INSERT INTO "whatsapp_conversation_messages" (
  "conversation_id", "provider_message_id", "source", "message_type",
  "text_body", "status", "occurred_at"
)
SELECT conversation.id, inbound.whatsapp_message_id, 'customer',
  CASE WHEN inbound.message_type = 'image' THEN 'image' ELSE 'text' END,
  inbound.text_body, 'received', inbound.received_at
FROM whatsapp_inbound_messages AS inbound
JOIN whatsapp_conversations AS conversation
  ON conversation.customer_phone = inbound.customer_phone
ON CONFLICT (provider_message_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO "whatsapp_conversation_messages" (
  "conversation_id", "outbound_message_id", "provider_message_id", "source",
  "message_type", "text_body", "media_storage_key", "media_mime_type",
  "status", "occurred_at", "updated_at"
)
SELECT outbound.conversation_id, outbound.id, outbound.whatsapp_message_id,
  'bot', outbound.message_type, outbound.text_body, outbound.media_storage_key,
  outbound.media_mime_type,
  CASE outbound.status
    WHEN 'pending' THEN 'queued'
    WHEN 'processing' THEN 'queued'
    ELSE outbound.status
  END,
  outbound.created_at, outbound.updated_at
FROM whatsapp_outbound_messages AS outbound
WHERE outbound.conversation_id IS NOT NULL
ON CONFLICT (outbound_message_id) DO NOTHING;
