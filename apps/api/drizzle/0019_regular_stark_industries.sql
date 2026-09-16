CREATE TABLE "shipping_locality_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_sha256" char(64) NOT NULL,
	"source_type" varchar(24) NOT NULL,
	"imported_count" integer NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_locality_imports_source_sha256_unique" UNIQUE("source_sha256"),
	CONSTRAINT "shipping_locality_imports_sha256_format" CHECK ("shipping_locality_imports"."source_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "shipping_locality_imports_source_type_allowed" CHECK ("shipping_locality_imports"."source_type" IN ('csv', '99envios_document')),
	CONSTRAINT "shipping_locality_imports_imported_count_valid" CHECK ("shipping_locality_imports"."imported_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shipping_localities" ADD COLUMN "active" boolean DEFAULT true NOT NULL;