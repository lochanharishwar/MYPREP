# BrandOS backend activation

## Verified status — 17 October 2026

BrandOS reports `ACTIVE_HEALTHY`. The latest read-only SQL attempt through the
connector failed with PostgreSQL password authentication; no schema changes were
made during this attempt. Database activation remains unverified. The server-only
Supabase key is still missing from the application configuration.

BrandOS already owns tables such as `public.brands`. BrandCurrent must not run
its original migrations in `public`, because those migrations would
target incompatible tables. The failed installation was transactional and made
no partial BrandCurrent changes.

Use a dedicated `brandcurrent` schema, expose it in BrandOS's Data API schema
settings, and set `SUPABASE_DB_SCHEMA=brandcurrent` in both Sites and the
processor. The application server already selects this schema through its
Supabase client, including the user-scoped workspace and invitation RPCs;
browser authentication remains on the normal Auth API. This preparation does
not change the current no-login browser workspace or enable paid public access.

## Migration preflight

There are 21 source migrations: `001` through `020`, followed by
`20260920132647_reliable_social_connections.sql`. No translated installer is
included yet. Before applying one:

- Inspect the target schema, extension locations, storage buckets and storage
  policies. Preserve all existing BrandOS objects and data.
- Translate `public.` object references and each function's `SET search_path`.
  Do not globally replace the word `public`: it also names the PUBLIC role in
  privilege revocations and the visibility column in `storage.buckets`.
- Execute the installation transaction with a trusted custom schema search
  path. Several migrations use unqualified table names, foreign keys, functions
  and policies; replacing `public.` alone would leave them pointed at the wrong
  objects. Exclude `public` from the fallback path. Function paths should use
  `pg_catalog,brandcurrent,extensions,pg_temp`; installation paths must put
  `brandcurrent` first so unqualified objects are created there.
- Preserve `auth`, `storage` and `extensions` references. Verify that pgvector is
  in `extensions`; `CREATE EXTENSION IF NOT EXISTS` does not relocate an existing
  extension. Install absent pgcrypto explicitly into `extensions`.
- Use distinct BrandCurrent bucket IDs and a uniquely named storage policy, or
  verify that the existing buckets and policies belong exclusively to this app
  before reuse. Original migrations use `media`, `published-media` and
  `read_brand_media`; migration `015` drops and recreates that policy on the
  shared `storage.objects` table. `ON CONFLICT DO NOTHING` does not validate a
  bucket's privacy, file-size or MIME settings. Any renamed buckets also require
  matching application and processor configuration.
- Grant schema usage, required server table access and intended authenticated
  SELECT access explicitly, while keeping RLS enabled and existing RPC execute
  restrictions intact. Never blanket-grant privileged functions to authenticated
  users. Neither anonymous nor authenticated users should have schema CREATE
  privileges. Expose `brandcurrent` through the Data API only with these controls.

Validate a translated chain first against isolated fixtures that include
incompatible `public` tables. Check that those tables remain unchanged, workspace
and invitation RPCs reach `brandcurrent`, cross-brand reads are denied, privileged
RPCs remain server-only, and storage policies resolve to the intended schema.
The existing public-schema database fixtures alone do not prove this deployment
path. After a live installation, verify schema access, RLS, storage and a scoped
RPC through the actual API before reporting backend activation complete.

Supabase documents custom-schema exposure and grants in
[Using Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas).

## Server configuration

Before applying the translated BrandCurrent migration set, configure these
Sites secrets:

- `SUPABASE_URL=https://dpuawqxkvmzcdmfagncf.supabase.co`
- `SUPABASE_ANON_KEY` with BrandOS's active publishable key
- `SUPABASE_SERVICE_ROLE_KEY` with BrandOS's server-only key
- `SUPABASE_DB_SCHEMA=brandcurrent`

Do not put a service-role key in browser code, a repository, or a public
environment variable. Email magic links use the publishable key in the browser
and the Supabase Auth service. Google login additionally requires a Google OAuth
client created in the owner's Google Cloud project; a public or scraped key
cannot be used for this.

Set the Auth Site URL and allowed redirect URL to
`https://brandcurrent-marketing.lochanharishwar.chatgpt.site`. Email provider is
enabled by default in Supabase, but production delivery should be tested after
the URL is configured. The current app uses `signInWithOtp`, which sends a magic
link by default.
