CREATE TABLE "shipping_preferences" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"carrier" varchar(32),
	"fallback_policy" varchar(8) DEFAULT 'allow' NOT NULL,
	"offer_mode" varchar(20) DEFAULT 'customer_choice' NOT NULL,
	"protected_insurance" varchar(8) DEFAULT 'standard' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_preferences_singleton" CHECK ("shipping_preferences"."id" = true),
	CONSTRAINT "shipping_preferences_carrier_format" CHECK ("shipping_preferences"."carrier" IS NULL OR "shipping_preferences"."carrier" ~ '^[a-z0-9_-]{2,32}$'),
	CONSTRAINT "shipping_preferences_fallback_allowed" CHECK ("shipping_preferences"."fallback_policy" IN ('allow', 'block')),
	CONSTRAINT "shipping_preferences_offer_mode_allowed" CHECK ("shipping_preferences"."offer_mode" IN ('customer_choice', 'economy_only', 'protected_only')),
	CONSTRAINT "shipping_preferences_insurance_allowed" CHECK ("shipping_preferences"."protected_insurance" IN ('standard', 'plus')),
	CONSTRAINT "shipping_preferences_block_requires_carrier" CHECK ("shipping_preferences"."fallback_policy" <> 'block' OR "shipping_preferences"."carrier" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "shipping_quotes" DROP CONSTRAINT "shipping_quotes_order_carrier_version_unique";--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" DROP CONSTRAINT "shipping_carrier_rules_carrier_format";--> statement-breakpoint
ALTER TABLE "shipping_quotes" DROP CONSTRAINT "shipping_quotes_cop_non_negative";--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" ALTER COLUMN "carrier" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" ADD COLUMN "fallback_policy" varchar(8) DEFAULT 'allow' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" ADD COLUMN "offer_mode" varchar(20) DEFAULT 'customer_choice' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" ADD COLUMN "protected_insurance" varchar(8) DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD COLUMN "insurance_mode" varchar(8) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD COLUMN "insurance_mode" varchar(8) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD COLUMN "insurance_cop" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_order_carrier_insurance_version_unique" UNIQUE("order_id","draft_version","carrier","insurance_mode");--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" ADD CONSTRAINT "shipping_carrier_rules_fallback_allowed" CHECK ("shipping_carrier_rules"."fallback_policy" IN ('allow', 'block'));--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" ADD CONSTRAINT "shipping_carrier_rules_offer_mode_allowed" CHECK ("shipping_carrier_rules"."offer_mode" IN ('customer_choice', 'economy_only', 'protected_only'));--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" ADD CONSTRAINT "shipping_carrier_rules_insurance_allowed" CHECK ("shipping_carrier_rules"."protected_insurance" IN ('standard', 'plus'));--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" ADD CONSTRAINT "shipping_carrier_rules_block_requires_carrier" CHECK ("shipping_carrier_rules"."fallback_policy" <> 'block' OR "shipping_carrier_rules"."carrier" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "shipping_carrier_rules" ADD CONSTRAINT "shipping_carrier_rules_carrier_format" CHECK ("shipping_carrier_rules"."carrier" IS NULL OR "shipping_carrier_rules"."carrier" ~ '^[a-z0-9_-]{2,32}$');--> statement-breakpoint
ALTER TABLE "shipping_guide_jobs" ADD CONSTRAINT "shipping_guide_jobs_insurance_mode_allowed" CHECK ("shipping_guide_jobs"."insurance_mode" IN ('none', 'standard', 'plus'));--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_insurance_mode_allowed" CHECK ("shipping_quotes"."insurance_mode" IN ('none', 'standard', 'plus'));--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_cop_non_negative" CHECK ("shipping_quotes"."freight_cop" >= 0 AND "shipping_quotes"."cash_on_delivery_cop" >= 0 AND "shipping_quotes"."surcharge_cop" >= 0 AND "shipping_quotes"."insurance_cop" >= 0);