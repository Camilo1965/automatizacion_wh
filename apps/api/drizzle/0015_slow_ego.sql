CREATE TABLE "shipping_observed_carriers" (
	"carrier" varchar(32) PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_policy_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(16) NOT NULL,
	"locality_carrier_code" varchar(32),
	"policy" jsonb NOT NULL,
	"action" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_policy_audits_scope_allowed" CHECK ("shipping_policy_audits"."scope" IN ('global', 'municipality')),
	CONSTRAINT "shipping_policy_audits_action_allowed" CHECK ("shipping_policy_audits"."action" IN ('upsert', 'deactivate'))
);
--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD COLUMN "policy_snapshot" jsonb;