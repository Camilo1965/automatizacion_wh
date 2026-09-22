CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_username" varchar(64),
	"action" varchar(64) NOT NULL,
	"target_type" varchar(64),
	"target_id" varchar(128),
	"correlation_id" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" varchar(16) NOT NULL,
	"ip_hash" char(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_result_check" CHECK ("result" IN ('success', 'failure'));--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_ip_hash_format" CHECK ("ip_hash" IS NULL OR "ip_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
CREATE INDEX "admin_audit_events_created_at_idx" ON "admin_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_events_actor_user_id_idx" ON "admin_audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_events_action_idx" ON "admin_audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_audit_events_target_idx" ON "admin_audit_events" USING btree ("target_type","target_id");
