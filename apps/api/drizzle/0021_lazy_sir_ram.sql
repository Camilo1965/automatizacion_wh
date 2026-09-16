CREATE TABLE "bot_flow_drafts" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"author" varchar(64) NOT NULL,
	"active_version_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_flow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"author" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_flow_versions_revision_unique" UNIQUE("revision")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "flow_version_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "flow_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "bot_flow_drafts" ADD CONSTRAINT "bot_flow_drafts_active_version_id_bot_flow_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."bot_flow_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_flow_version_id_bot_flow_versions_id_fk" FOREIGN KEY ("flow_version_id") REFERENCES "public"."bot_flow_versions"("id") ON DELETE no action ON UPDATE no action;