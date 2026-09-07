CREATE TABLE "shipping_carrier_rules" (
	"locality_carrier_code" varchar(32) PRIMARY KEY NOT NULL,
	"carrier" varchar(32) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_carrier_rules_dane_format" CHECK ("shipping_carrier_rules"."locality_carrier_code" ~ '^[0-9]{8}$'),
	CONSTRAINT "shipping_carrier_rules_carrier_format" CHECK ("shipping_carrier_rules"."carrier" ~ '^[a-z0-9_-]{2,32}$')
);
