CREATE TABLE "configuration_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(64) NOT NULL,
	"action" varchar(32) NOT NULL,
	"author" varchar(64) NOT NULL,
	"revision" integer,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_drafts" ADD COLUMN "public_configuration" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_versions" ADD COLUMN "public_configuration" jsonb DEFAULT '{}'::jsonb NOT NULL;