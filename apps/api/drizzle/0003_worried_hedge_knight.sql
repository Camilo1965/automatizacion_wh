CREATE TABLE "shipping_localities" (
	"carrier_code" varchar(32) PRIMARY KEY NOT NULL,
	"department" varchar(100) NOT NULL,
	"locality" varchar(120) NOT NULL,
	"normalized_name" varchar(240) NOT NULL,
	"country" char(2) DEFAULT 'CO' NOT NULL,
	"source_sha256" char(64) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_localities_country_co" CHECK ("shipping_localities"."country" = 'CO'),
	CONSTRAINT "shipping_localities_sha256_format" CHECK ("shipping_localities"."source_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX "shipping_localities_search_idx" ON "shipping_localities" USING btree ("department","normalized_name");