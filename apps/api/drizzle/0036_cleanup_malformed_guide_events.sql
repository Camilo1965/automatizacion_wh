DELETE FROM "whatsapp_conversation_messages" AS message
USING "shipping_guide_jobs" AS job
WHERE message."guide_job_id" = job."id"
  AND message."source" = 'system'
  AND message."message_type" = 'event'
  AND message."status" = 'internal'
  AND (
    NULLIF(BTRIM(job."pre_shipment_number"), '') IS NULL
    OR NULLIF(BTRIM(job."carrier"), '') IS NULL
  );
