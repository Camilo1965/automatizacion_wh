ALTER TABLE "customers" ALTER COLUMN "normalized_phone" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_anonymized_phone_profile_consistent" CHECK (
  "normalized_phone" IS NOT NULL OR (
    "display_name" IS NULL
    AND "needs_review" = true
    AND "marketing_consent" = 'unknown'
    AND "marketing_consent_channel" IS NULL
    AND "marketing_consent_purpose" IS NULL
    AND "marketing_consent_notice_version" IS NULL
    AND "marketing_consent_evidence_ref" IS NULL
    AND "marketing_consent_recorded_at" IS NULL
  )
);
