Audit the Supabase CLI and database workflow.

Run `npm run supabase -- --version` and inspect `supabase/config.toml`.
Confirm the local project is initialized and explain whether Docker is required for local start.
Do not run `supabase db reset`, `db push`, or migrations against the hosted project without explicit approval.
Do not print database URLs, tokens, or service-role keys.
