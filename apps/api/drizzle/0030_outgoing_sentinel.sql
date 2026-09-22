CREATE TABLE "admin_mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" char(64) NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_mfa_recovery_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_mfa_secrets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_secret" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_mfa_recovery_codes" ADD CONSTRAINT "admin_mfa_recovery_codes_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_mfa_secrets" ADD CONSTRAINT "admin_mfa_secrets_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_mfa_recovery_codes_user_id_idx" ON "admin_mfa_recovery_codes" USING btree ("user_id");