# Supabase CLI workflow

CleanOps now includes `supabase/config.toml` and project scripts for local Supabase development. The application still uses Drizzle migrations for the current database schema, so do not run `supabase db reset` against the production project.

## Check the CLI

```powershell
npm run supabase -- --version
npm run supabase:status
```

## Start a local Supabase stack

Docker Desktop must be running:

```powershell
npm run supabase:start
npm run supabase:status
npm run supabase:stop
```

Local Supabase uses the ports in `supabase/config.toml`. It is separate from the hosted database used by `.env.local`.

## Link the hosted project

Only do this when you have the Supabase project reference and CLI access:

```powershell
npm run supabase -- login
npm run supabase -- link --project-ref YOUR_PROJECT_REF
```

Never commit access tokens, database URLs, or generated signing keys.
