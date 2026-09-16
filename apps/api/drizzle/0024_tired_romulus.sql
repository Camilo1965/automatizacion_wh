CREATE TABLE "locality_catalog_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_sha256" char(64) NOT NULL,
	"source_type" varchar(24) NOT NULL,
	"rows" jsonb NOT NULL,
	"issues" jsonb NOT NULL,
	"base_version_id" uuid,
	"status" varchar(16) DEFAULT 'preview' NOT NULL,
	"author" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
