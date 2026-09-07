CREATE TABLE "catalog_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" char(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"references_data" jsonb NOT NULL,
	"errors_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	CONSTRAINT "catalog_imports_sha256_format" CHECK ("catalog_imports"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "catalog_imports_status_allowed" CHECK ("catalog_imports"."status" IN ('previewed', 'invalid', 'committed')),
	CONSTRAINT "catalog_imports_commit_state" CHECK (("catalog_imports"."status" = 'committed') = ("catalog_imports"."committed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "catalog_imports_status_created_at_idx" ON "catalog_imports" USING btree ("status","created_at");