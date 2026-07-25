ALTER TABLE "quote_line_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "quote_line_items" CASCADE;--> statement-breakpoint
CREATE INDEX "audit_log_company_created_idx" ON "audit_log" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "ghl_sync_log_company_status_idx" ON "ghl_sync_log" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "invoices_company_status_idx" ON "invoices" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "invoices_job_idx" ON "invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_assignments_user_idx" ON "job_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "webhook_events_source_idx" ON "webhook_events" USING btree ("source","processed_at");--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "archived_reason";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "archived_at";