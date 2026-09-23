CREATE TABLE "conversation_order_links" (
  "order_id" uuid PRIMARY KEY NOT NULL,
  "origin_conversation_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_order_links" ADD CONSTRAINT "conversation_order_links_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_order_links" ADD CONSTRAINT "conversation_order_links_origin_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("origin_conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "conversation_order_links_conversation_idx" ON "conversation_order_links" USING btree ("origin_conversation_id");
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" ADD COLUMN "guide_job_id" uuid;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" ADD COLUMN "guide_order_id" uuid;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" ADD CONSTRAINT "whatsapp_conversation_messages_guide_job_id_shipping_guide_jobs_id_fk" FOREIGN KEY ("guide_job_id") REFERENCES "public"."shipping_guide_jobs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" ADD CONSTRAINT "whatsapp_conversation_messages_guide_order_id_sales_orders_id_fk" FOREIGN KEY ("guide_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" ADD CONSTRAINT "whatsapp_conversation_messages_guide_job_unique" UNIQUE("guide_job_id");
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" DROP CONSTRAINT "whatsapp_conversation_messages_source_allowed";
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" ADD CONSTRAINT "whatsapp_conversation_messages_source_allowed" CHECK ("source" IN ('customer', 'bot', 'owner_panel', 'owner_mobile', 'system'));
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" DROP CONSTRAINT "whatsapp_conversation_messages_status_allowed";
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" ADD CONSTRAINT "whatsapp_conversation_messages_status_allowed" CHECK ("status" IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'cancelled', 'internal'));
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages" ADD CONSTRAINT "whatsapp_conversation_messages_guide_event_valid" CHECK (("guide_job_id" IS NULL AND "guide_order_id" IS NULL) OR ("guide_job_id" IS NOT NULL AND "guide_order_id" IS NOT NULL AND "source" = 'system' AND "message_type" = 'event' AND "status" = 'internal'));
--> statement-breakpoint
INSERT INTO "conversation_order_links" ("order_id", "origin_conversation_id", "created_at")
SELECT "active_order_id", "id", "updated_at"
FROM "whatsapp_conversations"
WHERE "active_order_id" IS NOT NULL
ON CONFLICT ("order_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "whatsapp_conversation_messages"
  ("conversation_id", "source", "message_type", "status", "occurred_at", "guide_job_id", "guide_order_id")
SELECT link."origin_conversation_id", 'system', 'event', 'internal', job."updated_at", job."id", job."order_id"
FROM "shipping_guide_jobs" job
JOIN "conversation_order_links" link ON link."order_id" = job."order_id"
WHERE job."status" = 'created'
ON CONFLICT ("guide_job_id") DO NOTHING;
