CREATE TABLE "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "display_name" varchar(120),
  "normalized_phone" varchar(13) NOT NULL,
  "marketing_consent" varchar(16) DEFAULT 'unknown' NOT NULL,
  "marketing_consent_channel" varchar(64),
  "marketing_consent_purpose" varchar(128),
  "marketing_consent_notice_version" varchar(64),
  "marketing_consent_evidence_ref" varchar(128),
  "marketing_consent_recorded_at" timestamp with time zone,
  "needs_review" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customers_normalized_phone_unique" UNIQUE("normalized_phone"),
  CONSTRAINT "customers_normalized_phone_format" CHECK ("normalized_phone" ~ '^\+573[0-9]{9}$'),
  CONSTRAINT "customers_marketing_consent_allowed" CHECK ("marketing_consent" IN ('unknown', 'granted', 'denied', 'revoked')),
  CONSTRAINT "customers_marketing_consent_evidence_consistent" CHECK (
    ("marketing_consent" = 'unknown'
      AND "marketing_consent_channel" IS NULL
      AND "marketing_consent_purpose" IS NULL
      AND "marketing_consent_notice_version" IS NULL
      AND "marketing_consent_evidence_ref" IS NULL
      AND "marketing_consent_recorded_at" IS NULL)
    OR ("marketing_consent" IN ('granted', 'denied', 'revoked')
      AND NULLIF(BTRIM("marketing_consent_channel"), '') IS NOT NULL
      AND NULLIF(BTRIM("marketing_consent_purpose"), '') IS NOT NULL
      AND NULLIF(BTRIM("marketing_consent_notice_version"), '') IS NOT NULL
      AND NULLIF(BTRIM("marketing_consent_evidence_ref"), '') IS NOT NULL
      AND "marketing_consent_recorded_at" IS NOT NULL)
  )
);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "customer_id" uuid;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "customer_id" uuid;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "customers_needs_review_created_idx"
  ON "customers" USING btree ("needs_review", "created_at", "id");
--> statement-breakpoint
CREATE INDEX "sales_orders_customer_id_created_at_idx"
  ON "sales_orders" USING btree ("customer_id", "created_at");
--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_customer_id_idx"
  ON "whatsapp_conversations" USING btree ("customer_id");
--> statement-breakpoint
WITH raw_contacts AS (
  SELECT order_row."customer_phone" AS phone, order_row."customer_name" AS display_name
  FROM "sales_orders" AS order_row
  UNION ALL
  SELECT conversation."customer_phone" AS phone, NULL::varchar AS display_name
  FROM "whatsapp_conversations" AS conversation
), digit_contacts AS (
  SELECT regexp_replace(BTRIM(phone), '[^0-9]', '', 'g') AS digits, display_name
  FROM raw_contacts
  WHERE NULLIF(BTRIM(phone), '') IS NOT NULL
), normalized_contacts AS (
  SELECT CASE
    WHEN digits ~ '^3[0-9]{9}$' THEN '+57' || digits
    WHEN digits ~ '^573[0-9]{9}$' THEN '+' || digits
    ELSE NULL
  END AS normalized_phone,
  display_name
  FROM digit_contacts
), valid_contacts AS (
  SELECT normalized_phone, display_name
  FROM normalized_contacts
  WHERE normalized_phone IS NOT NULL
), phone_groups AS (
  SELECT DISTINCT normalized_phone FROM valid_contacts
), name_groups AS (
  SELECT normalized_phone,
    count(DISTINCT lower(BTRIM(display_name))) AS distinct_name_count,
    min(BTRIM(display_name)) AS display_name
  FROM valid_contacts
  WHERE NULLIF(BTRIM(display_name), '') IS NOT NULL
  GROUP BY normalized_phone
)
INSERT INTO "customers" ("normalized_phone", "display_name", "needs_review")
SELECT phone_groups.normalized_phone,
  CASE WHEN COALESCE(name_groups.distinct_name_count, 0) = 1
    THEN name_groups.display_name ELSE NULL END,
  COALESCE(name_groups.distinct_name_count, 0) > 1
FROM phone_groups
LEFT JOIN name_groups USING (normalized_phone)
ON CONFLICT ("normalized_phone") DO NOTHING;
--> statement-breakpoint
WITH phone_rows AS (
  SELECT id,
    regexp_replace(BTRIM(customer_phone), '[^0-9]', '', 'g') AS digits
  FROM "sales_orders"
  WHERE NULLIF(BTRIM(customer_phone), '') IS NOT NULL
), normalized_orders AS (
  SELECT id, CASE
    WHEN digits ~ '^3[0-9]{9}$' THEN '+57' || digits
    WHEN digits ~ '^573[0-9]{9}$' THEN '+' || digits
    ELSE NULL
  END AS normalized_phone
  FROM phone_rows
)
UPDATE "sales_orders" AS order_row
SET "customer_id" = customer.id
FROM normalized_orders
JOIN "customers" AS customer
  ON customer.normalized_phone = normalized_orders.normalized_phone
WHERE order_row.id = normalized_orders.id
  AND normalized_orders.normalized_phone IS NOT NULL
  AND customer.needs_review = false;
--> statement-breakpoint
WITH phone_rows AS (
  SELECT id,
    regexp_replace(BTRIM(customer_phone), '[^0-9]', '', 'g') AS digits
  FROM "whatsapp_conversations"
  WHERE NULLIF(BTRIM(customer_phone), '') IS NOT NULL
), normalized_conversations AS (
  SELECT id, CASE
    WHEN digits ~ '^3[0-9]{9}$' THEN '+57' || digits
    WHEN digits ~ '^573[0-9]{9}$' THEN '+' || digits
    ELSE NULL
  END AS normalized_phone
  FROM phone_rows
)
UPDATE "whatsapp_conversations" AS conversation
SET "customer_id" = customer.id
FROM normalized_conversations
JOIN "customers" AS customer
  ON customer.normalized_phone = normalized_conversations.normalized_phone
WHERE conversation.id = normalized_conversations.id
  AND normalized_conversations.normalized_phone IS NOT NULL
  AND customer.needs_review = false;
