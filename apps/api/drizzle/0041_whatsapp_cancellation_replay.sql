ALTER TABLE "whatsapp_conversation_events" ADD COLUMN "cancellation_order_id" uuid;
--> statement-breakpoint
ALTER TABLE "whatsapp_conversation_events" ADD CONSTRAINT "whatsapp_conversation_events_cancellation_order_id_sales_orders_id_fk" FOREIGN KEY ("cancellation_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;
