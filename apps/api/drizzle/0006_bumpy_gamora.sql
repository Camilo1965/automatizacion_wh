CREATE TABLE "whatsapp_conversation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"whatsapp_message_id" varchar(128) NOT NULL,
	"sequence" integer NOT NULL,
	"state_before" varchar(32),
	"state_after" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_conversation_events_message_unique" UNIQUE("whatsapp_message_id"),
	CONSTRAINT "whatsapp_conversation_events_sequence_unique" UNIQUE("conversation_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_phone" varchar(20) NOT NULL,
	"state" varchar(32) NOT NULL,
	"mode" varchar(8) DEFAULT 'bot' NOT NULL,
	"selected_size" numeric(4, 1),
	"selected_reference_id" uuid,
	"active_order_id" uuid,
	"active_menu_version" integer DEFAULT 0 NOT NULL,
	"invalid_attempts" integer DEFAULT 0 NOT NULL,
	"last_inbound_message_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_conversations_customer_phone_unique" UNIQUE("customer_phone"),
	CONSTRAINT "whatsapp_conversations_mode_allowed" CHECK ("whatsapp_conversations"."mode" IN ('bot', 'human')),
	CONSTRAINT "whatsapp_conversations_invalid_attempts_non_negative" CHECK ("whatsapp_conversations"."invalid_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_events" ADD CONSTRAINT "whatsapp_conversation_events_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_selected_reference_id_catalog_references_id_fk" FOREIGN KEY ("selected_reference_id") REFERENCES "public"."catalog_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_active_order_id_sales_orders_id_fk" FOREIGN KEY ("active_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_events_conversation_created_idx" ON "whatsapp_conversation_events" USING btree ("conversation_id","created_at");