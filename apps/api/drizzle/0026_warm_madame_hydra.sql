CREATE TABLE "integration_drafts" (
	"provider" varchar(16) PRIMARY KEY NOT NULL,
	"encrypted_payload" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"tested_revision" integer,
	"tested_at" timestamp with time zone,
	"author" varchar(64) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(16) NOT NULL,
	"encrypted_payload" text NOT NULL,
	"revision" integer NOT NULL,
	"author" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD COLUMN "pdf_delivery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD COLUMN "pdf_last_attempt_at" timestamp with time zone;