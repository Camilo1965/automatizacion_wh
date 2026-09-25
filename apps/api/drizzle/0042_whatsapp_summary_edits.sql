ALTER TABLE "whatsapp_conversations" ADD COLUMN "summary_edit_action" varchar(16);
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_events" ADD COLUMN "cancellation_action" varchar(16);
