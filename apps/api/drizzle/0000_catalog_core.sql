CREATE TABLE "catalog_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"model_name" varchar(120) NOT NULL,
	"color" varchar(80) NOT NULL,
	"price_cop" integer NOT NULL,
	"photo_storage_key" varchar(255),
	"photo_mime_type" varchar(32),
	"photo_byte_size" integer,
	"photo_sha256" char(64),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_references_code_unique" UNIQUE("code"),
	CONSTRAINT "catalog_references_code_format" CHECK ("catalog_references"."code" ~ '^[A-Z0-9-]+$'),
	CONSTRAINT "catalog_references_price_positive" CHECK ("catalog_references"."price_cop" > 0),
	CONSTRAINT "catalog_references_photo_all_or_none" CHECK ((
        ("catalog_references"."photo_storage_key" IS NULL AND "catalog_references"."photo_mime_type" IS NULL AND "catalog_references"."photo_byte_size" IS NULL AND "catalog_references"."photo_sha256" IS NULL)
        OR
        ("catalog_references"."photo_storage_key" IS NOT NULL AND "catalog_references"."photo_mime_type" IS NOT NULL AND "catalog_references"."photo_byte_size" IS NOT NULL AND "catalog_references"."photo_sha256" IS NOT NULL)
      )),
	CONSTRAINT "catalog_references_photo_byte_size_positive" CHECK ("catalog_references"."photo_byte_size" IS NULL OR "catalog_references"."photo_byte_size" > 0),
	CONSTRAINT "catalog_references_photo_mime_type" CHECK ("catalog_references"."photo_mime_type" IS NULL OR "catalog_references"."photo_mime_type" IN ('image/jpeg', 'image/png')),
	CONSTRAINT "catalog_references_photo_sha256_format" CHECK ("catalog_references"."photo_sha256" IS NULL OR "catalog_references"."photo_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "catalog_stock" (
	"reference_id" uuid NOT NULL,
	"size" numeric(4, 1) NOT NULL,
	"physical_quantity" integer NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_stock_pkey" PRIMARY KEY("reference_id","size"),
	CONSTRAINT "catalog_stock_size_range" CHECK ("catalog_stock"."size" >= 1 AND "catalog_stock"."size" <= 99.5),
	CONSTRAINT "catalog_stock_size_half_steps" CHECK (("catalog_stock"."size" * 2) = trunc("catalog_stock"."size" * 2)),
	CONSTRAINT "catalog_stock_quantities_non_negative" CHECK ("catalog_stock"."physical_quantity" >= 0 AND "catalog_stock"."reserved_quantity" >= 0),
	CONSTRAINT "catalog_stock_reserved_lte_physical" CHECK ("catalog_stock"."reserved_quantity" <= "catalog_stock"."physical_quantity")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" uuid NOT NULL,
	"size" numeric(4, 1) NOT NULL,
	"previous_quantity" integer NOT NULL,
	"new_quantity" integer NOT NULL,
	"delta" integer NOT NULL,
	"reason" varchar(32) NOT NULL,
	"note" varchar(250),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_delta_consistent" CHECK ("inventory_movements"."delta" = "inventory_movements"."new_quantity" - "inventory_movements"."previous_quantity"),
	CONSTRAINT "inventory_movements_reason_allowed" CHECK ("inventory_movements"."reason" IN ('initial', 'manual_adjustment')),
	CONSTRAINT "inventory_movements_quantities_non_negative" CHECK ("inventory_movements"."previous_quantity" >= 0 AND "inventory_movements"."new_quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_stock" ADD CONSTRAINT "catalog_stock_reference_id_catalog_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."catalog_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reference_id_catalog_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."catalog_references"("id") ON DELETE restrict ON UPDATE no action;