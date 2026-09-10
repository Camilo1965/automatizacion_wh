CREATE TABLE "inventory_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_date" varchar(10) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"profile" varchar(16) DEFAULT 'adjustments' NOT NULL,
	"status" varchar(16) DEFAULT 'generated' NOT NULL,
	"movement_count" integer NOT NULL,
	"total_units" integer NOT NULL,
	"checksum" char(64) NOT NULL,
	"csv_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "inventory_closures_date_version_unique" UNIQUE("business_date","version"),
	CONSTRAINT "inventory_closures_profile_allowed" CHECK ("inventory_closures"."profile" IN ('absolute', 'adjustments')),
	CONSTRAINT "inventory_closures_status_allowed" CHECK ("inventory_closures"."status" IN ('generated', 'acknowledged', 'reopened'))
);
--> statement-breakpoint
CREATE TABLE "owner_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(64) NOT NULL,
	"severity" varchar(12) NOT NULL,
	"title" varchar(160) NOT NULL,
	"detail" text NOT NULL,
	"entity_url" varchar(255) NOT NULL,
	"deduplication_key" varchar(255) NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retry_safe" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "owner_alerts_severity_allowed" CHECK ("owner_alerts"."severity" IN ('info', 'warning', 'critical')),
	CONSTRAINT "owner_alerts_status_allowed" CHECK ("owner_alerts"."status" IN ('open', 'read', 'resolved'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "owner_alerts_open_dedup_unique" ON "owner_alerts" USING btree ("deduplication_key") WHERE "owner_alerts"."status" <> 'resolved';--> statement-breakpoint
CREATE INDEX "owner_alerts_status_created_idx" ON "owner_alerts" USING btree ("status","created_at");