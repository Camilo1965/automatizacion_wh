ALTER TABLE "whatsapp_conversation_messages"
  DROP CONSTRAINT "whatsapp_conversation_messages_guide_event_valid";
--> statement-breakpoint
DELETE FROM "whatsapp_conversation_messages"
WHERE "source" = 'system'
  AND "guide_job_id" IS NULL
  AND "guide_order_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_messages"
  ADD CONSTRAINT "whatsapp_conversation_messages_guide_event_valid"
  CHECK (
    (
      "guide_job_id" IS NULL
      AND "guide_order_id" IS NULL
      AND "source" <> 'system'
    )
    OR (
      "guide_job_id" IS NOT NULL
      AND "guide_order_id" IS NOT NULL
      AND "source" = 'system'
      AND "message_type" = 'event'
      AND "status" = 'internal'
    )
  );
