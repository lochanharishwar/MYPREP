import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedNames = [
  '001_workspace.sql',
  '002_attribution.sql',
  '003_operations.sql',
  '004_reliability.sql',
  '005_outbox.sql',
  '006_read_models.sql',
  '007_destination_lock.sql',
  '008_dispatch_gate.sql',
  '009_production_integrity.sql',
  '010_queue_limits.sql',
  '011_reporting.sql',
  '012_media_jobs.sql',
  '013_governance.sql',
  '014_account_coordination.sql',
  '015_recovery_and_commands.sql',
  '016_content_revision.sql',
  '017_brand_assets_and_operations.sql',
  '018_campaign_freeze.sql',
  '019_page_insight_search.sql',
  '020_atomic_disconnect.sql',
  '20260920132647_reliable_social_connections.sql',
];
const policyNames = [
  'read_brandcurrent_media',
  'protect_brandcurrent_private_anon',
  'protect_brandcurrent_private_member',
  'protect_brandcurrent_insert',
  'protect_brandcurrent_update',
  'protect_brandcurrent_delete',
];

// This is a bounded translator for the reviewed migration chain, not a general
// SQL parser. Comments and ordinary string values are retained. Dollar-quoted
// SQL/function bodies are translated recursively; role PUBLIC stays unchanged.
export function translateMigration(sql) {
  const code = (value) =>
    value
      .replace(/\bpublic\s*\./gi, 'brandcurrent.')
      .replace(
        /\bset\s+search_path\s*=\s*public(?:\s*,\s*extensions)?/gi,
        'set search_path=pg_catalog,brandcurrent,extensions,pg_temp',
      )
      .replace(/\bread_brand_media\b/g, 'read_brandcurrent_media')
      .replace(
        /storage\.foldername\(name\)/g,
        'storage.foldername(storage.objects.name)',
      )
      .replace(
        /create\s+extension\s+if\s+not\s+exists\s+pgcrypto\s*;/gi,
        'create extension if not exists pgcrypto with schema extensions;',
      );
  let result = '',
    pending = '',
    i = 0;
  const flush = () => {
    result += code(pending);
    pending = '';
  };
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      flush();
      const end = sql.indexOf('\n', i);
      const stop = end < 0 ? sql.length : end + 1;
      result += sql.slice(i, stop);
      i = stop;
    } else if (sql.startsWith('/*', i)) {
      flush();
      const end = sql.indexOf('*/', i + 2);
      if (end < 0) throw Error('Unclosed SQL comment.');
      result += sql.slice(i, end + 2);
      i = end + 2;
    } else if (sql[i] === "'") {
      flush();
      const start = i++;
      while (i < sql.length) {
        if (sql[i] !== "'") {
          i++;
          continue;
        }
        if (sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        i++;
        break;
      }
      const literal = sql.slice(start, i);
      if (!literal.endsWith("'") || literal.length < 2)
        throw Error('Unclosed SQL string.');
      result +=
        literal === "'media'"
          ? "'brandcurrent-media'"
          : literal === "'published-media'"
            ? "'brandcurrent-published-media'"
            : literal;
    } else {
      const delimiter = sql
        .slice(i)
        .match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (delimiter) {
        flush();
        const end = sql.indexOf(delimiter, i + delimiter.length);
        if (end < 0) throw Error('Unclosed SQL function body.');
        result +=
          delimiter +
          translateMigration(sql.slice(i + delimiter.length, end)) +
          delimiter;
        i = end + delimiter.length;
      } else {
        pending += sql[i++];
      }
    }
  }
  flush();
  return result;
}

export async function buildBrandCurrentInstaller(
  migrationDirectory = resolve(root, 'supabase/migrations'),
) {
  const names = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (names.join('\n') !== expectedNames.join('\n'))
    throw Error(
      'The migration chain changed. Review and test the isolated installer before adding migrations.',
    );
  const migrations = await Promise.all(
    names.map(async (name) => ({
      name,
      sql: (
        await readFile(resolve(migrationDirectory, name), 'utf8')
      ).replaceAll('\r\n', '\n'),
    })),
  );
  const hash = createHash('sha256')
    .update(migrations.map(({ name, sql }) => `${name}\n${sql}`).join('\n'))
    .digest('hex');
  return `-- BrandCurrent fresh installation only. Generated offline; review before execution.
-- Source migration chain SHA-256: ${hash}
-- Preserves public schema objects and unrelated storage buckets/policies.
-- On any error, stop and ROLLBACK. Never continue individual statements after errors.
begin;
set local search_path = pg_catalog;
set local lock_timeout = '10s';
select pg_advisory_xact_lock(hashtext('brandcurrent:fresh-install'));
do $preflight$
declare ext record;
begin
  if exists(select 1 from pg_namespace where nspname='brandcurrent') then
    raise exception 'BrandCurrent schema already exists; use a reviewed upgrade, not the fresh installer';
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
     or to_regclass('auth.users') is null then
    raise exception 'Supabase auth and storage schemas must already be installed';
  end if;
  if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then
    raise exception 'Storage row-level security must be enabled before installation';
  end if;
  if exists(select 1 from pg_namespace where nspname='extensions') and (
    has_schema_privilege('anon','extensions','CREATE') or has_schema_privilege('authenticated','extensions','CREATE')
  ) then
    raise exception 'The extensions schema must not allow browser roles to create objects';
  end if;
  if exists(select 1 from storage.buckets where id in ('brandcurrent-media','brandcurrent-published-media')) then
    raise exception 'A BrandCurrent bucket already exists; inspect ownership before installation';
  end if;
  if exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname in (${policyNames.map((name) => `'${name}'`).join(',')})) then
    raise exception 'A BrandCurrent storage policy already exists; inspect it before installation';
  end if;
  for ext in select e.extname,n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace
    where e.extname in ('vector','pgcrypto') loop
    if ext.nspname<>'extensions' then
      raise exception 'Extension % is in schema %. No extension is moved automatically; resolve this before installation',ext.extname,ext.nspname;
    end if;
  end loop;
end $preflight$;
create schema if not exists extensions;
create schema brandcurrent;
revoke all on schema brandcurrent from public,anon,authenticated;
set local search_path = brandcurrent,pg_catalog,extensions,pg_temp;

${migrations.map(({ name, sql }) => `-- Source: ${name}\n${translateMigration(sql)}`).join('\n\n')}

-- Every routine gets a trusted path, including trigger functions whose original
-- migrations omit one. No caller-writable public or temporary schema precedes it.
do $paths$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='brandcurrent' loop
    execute format('alter function %s set search_path=pg_catalog,brandcurrent,extensions,pg_temp', f.signature);
  end loop;
end $paths$;
revoke all on all tables in schema brandcurrent from public,anon,authenticated;
revoke all on all sequences in schema brandcurrent from public,anon,authenticated;
revoke all on all functions in schema brandcurrent from public,anon,authenticated;
-- Future migrations must explicitly revoke function EXECUTE grants again. A
-- schema-local default privilege cannot override PostgreSQL's global PUBLIC
-- function grant, and changing global defaults would affect the existing app.
grant usage on schema brandcurrent to authenticated,service_role;
grant all on all tables in schema brandcurrent to service_role;
grant all on all sequences in schema brandcurrent to service_role;
grant execute on all functions in schema brandcurrent to service_role;
grant select on brandcurrent.workspaces,brandcurrent.memberships,brandcurrent.brands,
  brandcurrent.entities,brandcurrent.budget_ledger,brandcurrent.journey_events,
  brandcurrent.feedback,brandcurrent.audit_log,brandcurrent.media_jobs,
  brandcurrent.approval_decisions to authenticated;
grant execute on function brandcurrent.create_workspace(text),brandcurrent.accept_invitations(),
  brandcurrent.is_member(uuid),brandcurrent.brand_access_for_user(uuid,uuid),
  brandcurrent.customer_access_for_user(uuid,uuid) to authenticated;

-- Existing storage policies combine with OR. Restrictive guards keep this app's
-- private bucket private even if another app has a broad permissive read policy.
create policy protect_brandcurrent_private_anon on storage.objects as restrictive
  for select to anon using(bucket_id<>'brandcurrent-media');
create policy protect_brandcurrent_private_member on storage.objects as restrictive
  for select to authenticated using(bucket_id<>'brandcurrent-media' or exists(
    select 1 from brandcurrent.brands b where b.workspace_id::text=(storage.foldername(storage.objects.name))[1]
      and b.id::text=(storage.foldername(storage.objects.name))[2] and brandcurrent.brand_access_for_user(b.id,auth.uid())));
create policy protect_brandcurrent_insert on storage.objects as restrictive for insert to anon,authenticated
  with check(bucket_id not in ('brandcurrent-media','brandcurrent-published-media'));
create policy protect_brandcurrent_update on storage.objects as restrictive for update to anon,authenticated
  using(bucket_id not in ('brandcurrent-media','brandcurrent-published-media'))
  with check(bucket_id not in ('brandcurrent-media','brandcurrent-published-media'));
create policy protect_brandcurrent_delete on storage.objects as restrictive for delete to anon,authenticated
  using(bucket_id not in ('brandcurrent-media','brandcurrent-published-media'));
commit;
`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [flag, output, ...extra] = process.argv.slice(2);
    if (flag !== '--output' || !output || !isAbsolute(output) || extra.length)
      throw Error(
        'Usage: node scripts/prepare-brandcurrent-database.mjs --output <absolute-new-file.sql>',
      );
    const sql = await buildBrandCurrentInstaller();
    await writeFile(output, sql, { encoding: 'utf8', flag: 'wx' });
    console.log(
      `Prepared fresh-install SQL: ${output}\nNo database connection or changes were made.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Unable to prepare installer.',
    );
    process.exitCode = 1;
  }
}
