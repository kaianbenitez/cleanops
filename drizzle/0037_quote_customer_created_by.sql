-- Track which admin account created a customer or a quote, per the vault
-- backlog item "Log which account did the quote for the customer / which
-- account added the customer". Nullable: existing rows predate this column,
-- and customers created by the GHL webhook ingestion have no admin account
-- to attribute.
ALTER TABLE "customers" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
