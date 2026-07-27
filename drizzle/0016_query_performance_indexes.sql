CREATE INDEX IF NOT EXISTS "customers_company_name_idx" ON "customers" USING btree ("company_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_lines_user_idx" ON "payroll_lines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_company_created_idx" ON "quotes" USING btree ("company_id","created_at");