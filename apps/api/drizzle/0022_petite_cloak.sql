ALTER TABLE "shipping_carrier_rules" ADD COLUMN "policy_config" jsonb;--> statement-breakpoint
ALTER TABLE "shipping_preferences" ADD COLUMN "policy_config" jsonb;