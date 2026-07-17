ALTER TABLE "payroll_lines" ADD COLUMN "team_lead_bonus_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD COLUMN "trainer_bonus_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD COLUMN "gusto_net_pay_cents" integer;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "recorded_by_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "notes" text;