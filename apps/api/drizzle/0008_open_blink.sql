CREATE TABLE "whatsapp_catalog_menu_options" (
	"menu_id" uuid NOT NULL,
	"reference_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"model_name" varchar(120) NOT NULL,
	"color" varchar(80) NOT NULL,
	"price_cop" integer NOT NULL,
	"photo_storage_key" varchar(255) NOT NULL,
	"photo_mime_type" varchar(32) NOT NULL,
	CONSTRAINT "whatsapp_catalog_menu_options_pkey" PRIMARY KEY("menu_id","reference_id"),
	CONSTRAINT "whatsapp_catalog_menu_options_position_unique" UNIQUE("menu_id","position"),
	CONSTRAINT "whatsapp_catalog_menu_options_code_unique" UNIQUE("menu_id","code"),
	CONSTRAINT "whatsapp_catalog_menu_options_mime_allowed" CHECK ("whatsapp_catalog_menu_options"."photo_mime_type" IN ('image/jpeg', 'image/png'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_catalog_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"confirmed_size" numeric(4, 1) NOT NULL,
	"next_after_code" varchar(32),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_catalog_menus_version_unique" UNIQUE("conversation_id","version")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_catalog_menu_options" ADD CONSTRAINT "whatsapp_catalog_menu_options_menu_id_whatsapp_catalog_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."whatsapp_catalog_menus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_catalog_menu_options" ADD CONSTRAINT "whatsapp_catalog_menu_options_reference_id_catalog_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."catalog_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_catalog_menus" ADD CONSTRAINT "whatsapp_catalog_menus_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_catalog_menus_active_idx" ON "whatsapp_catalog_menus" USING btree ("conversation_id","active");