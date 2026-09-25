ALTER TABLE "whatsapp_conversations"
  ADD COLUMN "offered_localities" jsonb NOT NULL DEFAULT '[]'::jsonb;
