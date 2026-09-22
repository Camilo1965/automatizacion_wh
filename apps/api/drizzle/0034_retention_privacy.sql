CREATE TABLE "retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"classes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"activated_by_user_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "retention_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"policy_version" integer NOT NULL,
	"mode" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"progress" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cursor" jsonb DEFAULT '{"classIndex":0,"lastId":null}'::jsonb NOT NULL,
	"report" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"actor_user_id" uuid,
	"correlation_id" varchar(64),
	"batch_size" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_created_by_user_id_admin_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_activated_by_user_id_admin_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_policy_id_retention_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."retention_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_actor_user_id_admin_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_version_unique" UNIQUE("version");--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_status_check" CHECK ("status" IN ('draft', 'active', 'superseded', 'disabled'));--> statement-breakpoint
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_mode_check" CHECK ("mode" IN ('dry_run', 'execute'));--> statement-breakpoint
ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_status_check" CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'cancelled'));--> statement-breakpoint
CREATE INDEX "retention_policies_status_idx" ON "retention_policies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "retention_runs_policy_id_idx" ON "retention_runs" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "retention_runs_created_at_idx" ON "retention_runs" USING btree ("created_at");
