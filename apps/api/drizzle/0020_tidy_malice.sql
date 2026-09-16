CREATE TABLE "integration_settings" (
	"provider" varchar(16) PRIMARY KEY NOT NULL,
	"encrypted_payload" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_settings_provider_allowed" CHECK ("integration_settings"."provider" IN ('whatsapp', 'shipping')),
	CONSTRAINT "integration_settings_encrypted_payload_format" CHECK ("integration_settings"."encrypted_payload" ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
);
