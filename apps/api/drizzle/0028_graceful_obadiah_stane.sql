CREATE TABLE "owner_alert_deliveries" (
	"alert_id" uuid PRIMARY KEY NOT NULL,
	"status" varchar(16) DEFAULT 'processing' NOT NULL,
	"message_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "owner_alert_deliveries" ADD CONSTRAINT "owner_alert_deliveries_alert_id_owner_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."owner_alerts"("id") ON DELETE restrict ON UPDATE no action;