import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import {
  buildBrandCurrentInstaller,
  translateMigration,
} from '../scripts/prepare-brandcurrent-database.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const invitee = '33333333-3333-4333-8333-333333333333';
let pg: PGlite;
let installer: string;
let workspace: string;
let visibleBrand: string;
let hiddenBrand: string;
async function fixture() {
  const db = new PGlite({ extensions: { vector, pgcrypto } });
  await db.exec(`
    create schema auth; create schema storage; create schema extensions;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    grant usage on schema auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    create table public.brands(legacy_id text primary key,legacy_note text);
    insert into public.brands values('keep-me','Existing BrandOS data');
    create table public.workspaces(legacy_name text);
    insert into public.workspaces values('Original workspace');
    insert into storage.buckets values('media','Original media',false,1000,array['text/plain']),('published-media','Original published',true,2000,array['image/png']);
    insert into storage.objects(bucket_id,name) values('media','legacy-file');
    create policy read_brand_media on storage.objects for select to anon,authenticated using(true);
    create policy legacy_write on storage.objects for all to anon,authenticated using(true) with check(true);
    insert into auth.users values('${owner}'),('${member}'),('${invitee}');
  `);
  return db;
}
async function asUser(user: string) {
  await pg.exec('reset role');
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await pg.exec('set role authenticated');
}
beforeAll(async () => {
  installer = await buildBrandCurrentInstaller();
  pg = await fixture();
  await pg.exec(installer);
  await asUser(owner);
  workspace = (
    await pg.query<{ id: string }>(
      "select brandcurrent.create_workspace('Isolated fixture') id",
    )
  ).rows[0].id;
  await pg.exec('reset role');
  visibleBrand = (
    await pg.query<{ id: string }>(
      "insert into brandcurrent.brands(workspace_id,name,website) values($1,'Visible brand','https://one.example') returning id",
      [workspace],
    )
  ).rows[0].id;
  hiddenBrand = (
    await pg.query<{ id: string }>(
      "insert into brandcurrent.brands(workspace_id,name,website) values($1,'Hidden brand','https://two.example') returning id",
      [workspace],
    )
  ).rows[0].id;
  await pg.query(
    "insert into brandcurrent.memberships(workspace_id,user_id,role,brand_access) values($1,$2,'viewer','assigned')",
    [workspace, member],
  );
  await pg.query(
    'insert into brandcurrent.brand_permissions values($1,$2,$3)',
    [workspace, visibleBrand, member],
  );
  for (const brand of [visibleBrand, hiddenBrand]) {
    await pg.query(
      "insert into brandcurrent.entities(workspace_id,brand_id,kind,payload) values($1,$2,'dna','{}')",
      [workspace, brand],
    );
    await pg.query(
      "insert into storage.objects(bucket_id,name) values('brandcurrent-media',$1)",
      [`${workspace}/${brand}/asset.png`],
    );
  }
}, 60000);
afterAll(async () => {
  await pg?.close();
});

describe('isolated BrandCurrent installation (local PostgreSQL fixture)', () => {
  it('preserves incompatible public data and existing bucket settings/policies', async () => {
    await pg.exec('reset role');
    expect((await pg.query('select * from public.brands')).rows).toEqual([
      { legacy_id: 'keep-me', legacy_note: 'Existing BrandOS data' },
    ]);
    expect((await pg.query('select * from public.workspaces')).rows).toEqual([
      { legacy_name: 'Original workspace' },
    ]);
    expect(
      (
        await pg.query(
          "select name,file_size_limit from storage.buckets where id='media'",
        )
      ).rows,
    ).toEqual([{ name: 'Original media', file_size_limit: 1000 }]);
    expect(
      (
        await pg.query(
          "select policyname,qual from pg_policies where schemaname='storage' and policyname='read_brand_media'",
        )
      ).rows,
    ).toEqual([{ policyname: 'read_brand_media', qual: 'true' }]);
    expect(
      (
        await pg.query(
          "select id,public from storage.buckets where id like 'brandcurrent-%' order by id",
        )
      ).rows,
    ).toEqual([
      { id: 'brandcurrent-media', public: false },
      { id: 'brandcurrent-published-media', public: true },
    ]);
    expect(
      (
        await pg.query(
          "select e.extname,n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('vector','pgcrypto') order by e.extname",
        )
      ).rows,
    ).toEqual([
      { extname: 'pgcrypto', nspname: 'extensions' },
      { extname: 'vector', nspname: 'extensions' },
    ]);
  });
  it('runs authenticated workspace and invitation RPCs in the isolated schema', async () => {
    await pg.exec('reset role');
    expect(
      (
        await pg.query('select name from brandcurrent.workspaces where id=$1', [
          workspace,
        ])
      ).rows,
    ).toEqual([{ name: 'Isolated fixture' }]);
    await pg.query(
      "insert into brandcurrent.invitations(workspace_id,email,role) values($1,'fixture@example.test','editor')",
      [workspace],
    );
    await asUser(invitee);
    await pg.query(
      "select set_config('request.jwt.claim.email','fixture@example.test',false)",
    );
    await pg.query('select brandcurrent.accept_invitations()');
    expect(
      (
        await pg.query(
          'select workspace_id,role from brandcurrent.memberships where user_id=$1',
          [invitee],
        )
      ).rows,
    ).toEqual([{ workspace_id: workspace, role: 'editor' }]);
    await pg.exec('reset role');
    expect(
      (await pg.query('select email from brandcurrent.invitations')).rows,
    ).toEqual([]);
  });
  it('denies cross-brand reads and direct mutation while preserving intended reads', async () => {
    await asUser(member);
    expect((await pg.query('select id from brandcurrent.brands')).rows).toEqual(
      [{ id: visibleBrand }],
    );
    expect(
      (await pg.query('select brand_id from brandcurrent.entities')).rows,
    ).toEqual([{ brand_id: visibleBrand }]);
    await expect(
      pg.query(
        "insert into brandcurrent.brands(workspace_id,name,website) values($1,'Unauthorized','https://invalid.example')",
        [workspace],
      ),
    ).rejects.toThrow('permission denied');
    await expect(
      pg.query('select brandcurrent.budget_usage($1)', [workspace]),
    ).rejects.toThrow('permission denied');
    await pg.exec('reset role; set role service_role');
    expect(
      (
        await pg.query('select brandcurrent.budget_usage($1) result', [
          workspace,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it('keeps private media scoped despite unrelated broad permissive storage policies', async () => {
    await asUser(member);
    const files = (
      await pg.query<{ name: string }>(
        'select name from storage.objects order by name',
      )
    ).rows.map((r) => r.name);
    expect(files).toEqual(
      [`${workspace}/${visibleBrand}/asset.png`, 'legacy-file'].sort(),
    );
    await expect(
      pg.query(
        "insert into storage.objects(bucket_id,name) values('brandcurrent-media','forged')",
      ),
    ).rejects.toThrow('row-level security');
    await expect(
      pg.query(
        "insert into storage.objects(bucket_id,name) values('brandcurrent-published-media','forged')",
      ),
    ).rejects.toThrow('row-level security');
    expect(
      (
        await pg.query(
          "update storage.objects set name='rewritten' where bucket_id='brandcurrent-media' returning name",
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await pg.query(
          "delete from storage.objects where bucket_id='brandcurrent-media' returning name",
        )
      ).rows,
    ).toEqual([]);
    await pg.exec('reset role; set role anon');
    expect((await pg.query('select name from storage.objects')).rows).toEqual([
      { name: 'legacy-file' },
    ]);
    await expect(pg.query('select * from brandcurrent.brands')).rejects.toThrow(
      'permission denied',
    );
    await pg.exec('reset role');
    expect(
      (
        await pg.query<{ n: number }>(
          "select count(*)::int n from storage.objects where bucket_id='brandcurrent-media'",
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it('pins every function path and denies schema creation to browser roles', async () => {
    await pg.exec('reset role');
    const paths = (
      await pg.query<{ proconfig: string[] }>(
        "select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='brandcurrent'",
      )
    ).rows;
    expect(paths.length).toBeGreaterThan(30);
    for (const f of paths)
      expect(f.proconfig).toContain(
        'search_path=pg_catalog, brandcurrent, extensions, pg_temp',
      );
    expect(
      (
        await pg.query(
          "select has_schema_privilege('authenticated','brandcurrent','CREATE') auth,has_schema_privilege('anon','brandcurrent','USAGE') anon",
        )
      ).rows,
    ).toEqual([{ auth: false, anon: false }]);
  });
  it('limits browser RPC access to the five intended functions and enables RLS on every table', async () => {
    await pg.exec('reset role');
    const privileges = (
      await pg.query<{
        proname: string;
        authenticated: boolean;
        anon: boolean;
        server: boolean;
      }>(`
      select p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
        has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('service_role',p.oid,'EXECUTE') server
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='brandcurrent'
    `)
    ).rows;
    expect(
      privileges
        .filter((p) => p.authenticated)
        .map((p) => p.proname)
        .sort(),
    ).toEqual([
      'accept_invitations',
      'brand_access_for_user',
      'create_workspace',
      'customer_access_for_user',
      'is_member',
    ]);
    expect(privileges.every((p) => !p.anon && p.server)).toBe(true);
    expect(
      (
        await pg.query(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='brandcurrent' and c.relkind in ('r','p') and not c.relrowsecurity`)
      ).rows,
    ).toEqual([]);
  });
  it('rejects repeat installation without changing the existing application', async () => {
    await pg.exec('reset role');
    await expect(pg.exec(installer)).rejects.toThrow('schema already exists');
    await pg.exec('rollback');
    expect(
      (await pg.query('select id from brandcurrent.workspaces')).rows,
    ).toEqual([{ id: workspace }]);
  });
  it.each(['bucket', 'policy', 'extension', 'extension permissions'])(
    'rolls back a conflicting %s before creating any application schema',
    async (conflict) => {
      const db = await fixture();
      try {
        if (conflict === 'bucket')
          await db.exec(
            "insert into storage.buckets(id,name,public) values('brandcurrent-media','Other app',true)",
          );
        if (conflict === 'policy')
          await db.exec(
            'create policy read_brandcurrent_media on storage.objects for select using(false)',
          );
        if (conflict === 'extension')
          await db.exec('create extension pgcrypto with schema public');
        if (conflict === 'extension permissions')
          await db.exec('grant create on schema extensions to authenticated');
        const message =
          conflict === 'extension'
            ? 'Extension pgcrypto is in schema public'
            : conflict === 'extension permissions'
              ? 'must not allow browser roles'
              : 'already exists';
        await expect(db.exec(installer)).rejects.toThrow(message);
        await db.exec('rollback');
        expect(
          (
            await db.query(
              "select schema_name from information_schema.schemata where schema_name='brandcurrent'",
            )
          ).rows,
        ).toEqual([]);
        expect(
          (await db.query('select legacy_id from public.brands')).rows,
        ).toEqual([{ legacy_id: 'keep-me' }]);
      } finally {
        await db.close();
      }
    },
    60000,
  );
  it('rolls back a late installation failure, including newly created buckets and extensions', async () => {
    const db = await fixture();
    try {
      const failing = installer.replace(
        /commit;\s*$/,
        () =>
          "do $$begin raise exception 'fixture failure before commit';end$$;\ncommit;",
      );
      await expect(db.exec(failing)).rejects.toThrow(
        'fixture failure before commit',
      );
      await db.exec('rollback');
      expect(
        (
          await db.query(
            "select schema_name from information_schema.schemata where schema_name='brandcurrent'",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            "select id from storage.buckets where id like 'brandcurrent-%'",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            "select extname from pg_extension where extname in ('vector','pgcrypto')",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (await db.query('select legacy_id from public.brands')).rows,
      ).toEqual([{ legacy_id: 'keep-me' }]);
    } finally {
      await db.close();
    }
  }, 60000);
  it('produces byte-for-byte deterministic SQL from the same migration chain', async () => {
    expect(await buildBrandCurrentInstaller()).toBe(installer);
  });
  it('translates SQL references without changing role PUBLIC or incidental quoted text', () => {
    expect(
      translateMigration(
        "-- public.keep\nselect 'public.keep', public.brands; revoke all on function public.f() from public;",
      ),
    ).toBe(
      "-- public.keep\nselect 'public.keep', brandcurrent.brands; revoke all on function brandcurrent.f() from public;",
    );
  });
});
