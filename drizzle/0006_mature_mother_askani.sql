CREATE TABLE "employee_pto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_period" text DEFAULT 'full' NOT NULL,
	"end_period" text DEFAULT 'full' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_pto" ADD CONSTRAINT "employee_pto_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pto" ADD CONSTRAINT "employee_pto_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_pto_user_date_idx" ON "employee_pto" USING btree ("user_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "employee_pto_company_date_idx" ON "employee_pto" USING btree ("company_id","start_date","end_date");