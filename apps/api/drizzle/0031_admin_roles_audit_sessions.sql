ALTER TABLE "admin_users" ADD COLUMN "role" varchar(16) DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_check" CHECK ("role" IN ('owner', 'operator'));
