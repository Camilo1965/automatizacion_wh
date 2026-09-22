ALTER TABLE "admin_sessions" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
UPDATE "admin_sessions" SET "last_seen_at" = "created_at" WHERE "last_seen_at" IS NULL;--> statement-breakpoint
ALTER TABLE "admin_sessions" ALTER COLUMN "last_seen_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "admin_sessions" ALTER COLUMN "last_seen_at" SET NOT NULL;
