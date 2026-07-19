Run a safe GHL integration check.

Confirm `GHL_API_KEY`, `GHL_LOCATION_ID`, and `GHL_WEBHOOK_SECRET` are configured without printing values.
Call the read-only location health endpoint for the configured test location.
Inspect inbound webhook signature/idempotency handling and outbound retry logs.
Do not create/update contacts, tags, workflows, or production records.
