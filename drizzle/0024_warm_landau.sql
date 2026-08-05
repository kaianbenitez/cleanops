ALTER TABLE "companies" ADD COLUMN "square_access_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "square_environment" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "square_webhook_signature_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "google_maps_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "geocoded_latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "geocoded_longitude" numeric(10, 7);
