# BrandOS backend activation

## Status — 22 October 2026

The latest read-only SQL attempt through the Supabase connector failed with
PostgreSQL password authentication. No live database changes were made. The
server-only Supabase key is also missing from the application configuration.
Backend activation is blocked until database access and server configuration
are repaired. Local/browser workspace use does not require this activation.

BrandOS already owns incompatible tables such as `public.brands`. **Do not run
BrandCurrent's original migrations in this project's `public` schema.** The
isolated installer is now implemented and tested locally, but it has not been
applied to BrandOS. Local database fixtures do not prove a live integration.

## Prepare the isolated installation

The generator combines the 21 reviewed migrations (`001` through `020`, then
`20260920132647_reliable_social_connections.sql`) into one transaction. It never
connects to a database, and it refuses to overwrite its output file:

```powershell
node scripts/prepare-brandcurrent-database.mjs --output 'D:\CHATGPT\MARKETTING BY CODEX\work\brandcurrent-fresh-install.sql'
```

Use an existing output directory and a new filename. The output includes a
SHA-256 fingerprint of the migration sources and is deterministic for unchanged
sources. Adding/removing a migration requires reviewing the generator's migration
allowlist and rerunning the isolated tests. Changes within an existing migration
also require review; the fingerprint identifies the exact source chain.

The generated SQL:

- Creates the dedicated `brandcurrent` schema, with trusted function search paths
  and row-level security. Unqualified installation statements run in this schema.
- Uses separate buckets `brandcurrent-media` (private) and
  `brandcurrent-published-media` (public delivery copies for publishing).
- Preserves existing `public` tables, generic storage buckets, and unrelated
  storage policies. It never relocates extensions or changes global privilege
  defaults.
- Requires existing `vector` and `pgcrypto` extensions to be in `extensions`, or
  installs them there if absent. Browser roles must not be able to create objects
  in that trusted schema.
- Rejects an existing target schema, either bucket, or any policy name it owns.
  A repeated installation is an error, not an upgrade or a reset.
- Qualifies `storage.objects.name` in media policies so a brand's display name
  cannot be mistaken for an asset's storage path.
- Adds restrictive storage guards so unrelated permissive policies cannot expose
  private media or let browser roles write either BrandCurrent bucket.
- Grants authenticated users only the intended reads and five scoped functions:
  `create_workspace`, `accept_invitations`, `is_member`,
  `brand_access_for_user`, and `customer_access_for_user`. Other application
  routines remain server-only. Browser roles cannot create schema objects.

Future migrations must explicitly revoke `PUBLIC`, `anon`, and `authenticated`
function privileges before granting the intended access. A schema-local default
privilege cannot undo PostgreSQL's global default `PUBLIC EXECUTE` grant.

## Validation already completed locally

`npm test -- tests/custom-schema.test.ts` executes the generated SQL in PGlite,
including pgcrypto and pgvector. Its fixtures contain incompatible `public`
tables, original storage data, and deliberately broad legacy storage policies.
The tests cover preservation of those records/settings, workspace creation,
invitation-created membership, cross-brand denial, private-media isolation,
browser mutation denial, function privileges and paths, RLS on every table,
conflicting targets/extensions/permissions, repeat installation, and complete
rollback after a late failure. The generator is also checked for determinism.

This does not exercise hosted Supabase Auth, PostgREST, Storage file delivery,
OAuth, Inngest, or social publishing.

## Live activation steps still required

1. Restore authenticated database access to BrandOS, then inspect target schemas,
   extension locations, storage buckets/policies and backups. Resolve preflight
   conflicts manually; never drop existing objects just to make installation pass.
2. Review the generated SQL and execute the complete transaction as an authorized
   database owner with stop-on-error behavior. After an error, issue `ROLLBACK`;
   do not continue by executing later statements individually.
3. Add `brandcurrent` to the exposed schemas in BrandOS's Data API settings.
   Configure the server and processor with matching schema and bucket names.
4. Verify actual Data API requests: user-scoped workspace/invitation RPCs, scoped
   reads, cross-brand denial, denied browser writes, server operations, private
   asset upload/signing/deletion, and publication-copy storage. Check Supabase's
   security advisors before enabling live jobs.

Supabase documents schema exposure and grants in
[Using Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas).
Do not report backend activation complete before these live checks pass.

## Server configuration

Use secure environment settings in Sites and, where applicable, the processor:

- `SUPABASE_URL=https://dpuawqxkvmzcdmfagncf.supabase.co`
- `SUPABASE_ANON_KEY` with BrandOS's active publishable/anon key
- `SUPABASE_SERVICE_ROLE_KEY` with BrandOS's server-only key
- `SUPABASE_DB_SCHEMA=brandcurrent`
- `SUPABASE_MEDIA_BUCKET=brandcurrent-media`
- `SUPABASE_PUBLISHED_MEDIA_BUCKET=brandcurrent-published-media`

Custom schemas require explicit bucket configuration. Existing asset paths are
not migrated; changing the bucket settings of an already populated installation
requires a separately reviewed media migration.

Never put the service-role key in browser code, chat, a repository, or a public
environment variable. Enabling the secure backend does not by itself enable paid
public automation. Spending limits, durable workflow configuration, and provider
access must also be configured and tested. Paid testing remains disabled by user
request.

The current local/browser workspace continues without app sign-in. If secure
team login is later enabled, configure the Auth Site URL and allowed redirects
for `https://brandcurrent-marketing.lochanharishwar.chatgpt.site`, then test email
delivery. Google sign-in requires an OAuth client owned by the user; publicly
found credentials cannot substitute for that configuration.
