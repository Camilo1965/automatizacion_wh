ALTER TABLE "whatsapp_conversations" ADD COLUMN "summary_generation" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_events" ADD COLUMN "continuation_action" varchar(16);
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_events" ADD COLUMN "continuation_reply" text;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_events" ADD COLUMN "continuation_generation" integer;
