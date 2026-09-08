import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
const pg = new PGlite({ extensions: { vector, pgcrypto } });
const owner = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
let workspace: string, brand: string;
async function record(kind: string, payload: unknown, brandId = brand) {
  return (
    await pg.query<{ id: string }>(
      'insert into entities(workspace_id,brand_id,kind,payload) values($1,$2,$3,$4) returning id',
      [workspace, brandId, kind, JSON.stringify(payload)],
    )
  ).rows[0].id;
}
beforeAll(async () => {
  await pg.exec(
    `create schema auth;create schema storage;create schema extensions;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`,
  );
  for (const name of (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    try {
      await pg.exec(await readFile('supabase/migrations/' + name, 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${name}: ${(e as Error).message}`, {
        cause: e,
      });
    }
  await pg.exec(
    `grant usage on schema public,auth,storage to authenticated,anon,service_role;grant select,insert,update,delete on all tables in schema public,storage to authenticated,anon,service_role;insert into auth.users values('${owner}'),('${other}');`,
  );
}, 60000);
beforeEach(async () => {
  await pg.exec('reset role;truncate workspaces cascade;');
  workspace = (
    await pg.query<{ id: string }>(
      "insert into workspaces(name,monthly_limit) values('Test workspace',10) returning id",
    )
  ).rows[0].id;
  brand = (
    await pg.query<{ id: string }>(
      "insert into brands(workspace_id,name,website) values($1,'Fixture brand','https://example.com') returning id",
      [workspace],
    )
  ).rows[0].id;
  await pg.query("insert into memberships values($1,$2,'owner')", [
    workspace,
    owner,
  ]);
});
afterAll(() => pg.close());
describe('database gates', () => {
  it('commits exactly one command result and outbox across retries', async () => {
    const key = crypto.randomUUID(),
      request = { idea: 'Fixture campaign' },
      args = {
        brandId: brand,
        kind: 'campaign',
        payload: { status: 'queued', budget: 2 },
      };
    const call = () =>
      pg.query<{ r: { id: string } }>(
        "select business_command($1,$2,$3,'campaign',$4,$5) r",
        [workspace, owner, key, JSON.stringify(request), JSON.stringify(args)],
      );
    const first = (await call()).rows[0].r,
      second = (await call()).rows[0].r;
    expect(second.id).toBe(first.id);
    expect(
      (await pg.query('select * from workflow_outbox where id=$1', [first.id]))
        .rows,
    ).toHaveLength(1);
    await expect(
      pg.query("select business_command($1,$2,$3,'campaign','{}',$4)", [
        workspace,
        owner,
        key,
        JSON.stringify(args),
      ]),
    ).rejects.toThrow('Idempotency');
  });
  it('restores a stranded schedule outbox without creating another post', async () => {
    const c = await record('content', { status: 'approved', contentHash: 'x' });
    const a = await record('approval', { contentId: c, contentHash: 'x' });
    const id = await record('schedule', {
      approvalId: a,
      contentId: c,
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      revision: 1,
    });
    await pg.query('delete from workflow_outbox where id=$1', [id + '-1']);
    await pg.query('select repair_job_delivery()');
    await pg.query('select repair_job_delivery()');
    expect(
      (await pg.query('select * from workflow_outbox where id=$1', [id + '-1']))
        .rows,
    ).toHaveLength(1);
  });
  it('revokes approvals transactionally and blocks cancelled workers', async () => {
    const c = await record('content', { status: 'approved' }),
      a = await record('approval', { contentId: c });
    const id = await record('schedule', {
      approvalId: a,
      contentId: c,
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      revision: 1,
    });
    await pg.query('select revoke_approval($1,$2,$3)', [workspace, a, owner]);
    expect(
      (
        await pg.query<{ status: string }>(
          "select payload->>'status' status from entities where id=$1",
          [id],
        )
      ).rows[0].status,
    ).toBe('cancelled');
    expect(
      (
        await pg.query<{ v: boolean }>(
          'select claim_provider_dispatch($1,1) v',
          [id],
        )
      ).rows[0].v,
    ).toBe(false);
    await expect(
      pg.query(
        'update entities set payload=payload||\'{"status":"uploading"}\' where id=$1',
        [id],
      ),
    ).rejects.toThrow();
  });
  it('prevents audit rewrites and preserves dispatch evidence', async () => {
    const id = await record('schedule', { status: 'publishing', revision: 1 });
    await pg.query('select claim_provider_dispatch($1,1)', [id]);
    await pg.query(
      'update entities set payload=\'{"status":"published"}\' where id=$1',
      [id],
    );
    expect(
      (
        await pg.query<{ v: boolean }>(
          "select payload ? 'dispatchStartedAt' v from entities where id=$1",
          [id],
        )
      ).rows[0].v,
    ).toBe(true);
    await pg.query(
      "insert into audit_log(workspace_id,action) values($1,'fixture')",
      [workspace],
    );
    await expect(
      pg.query("update audit_log set action='changed'"),
    ).rejects.toThrow('append-only');
  });
  it('protects confirmed publication when downstream feedback delivery fails', async () => {
    const id = await record('schedule', { status: 'publishing', revision: 1 });
    await pg.query(
      'update entities set payload=payload||\'{"status":"published","providerId":"verified-id"}\' where id=$1',
      [id],
    );
    expect(
      (
        await pg.query('select * from workflow_outbox where id=$1', [
          id + '-feedback-initial',
        ])
      ).rows,
    ).toHaveLength(1);
    await expect(
      pg.query(
        'update entities set payload=payload||\'{"status":"failed"}\' where id=$1',
        [id],
      ),
    ).rejects.toThrow('terminal');
    expect(
      (
        await pg.query<{ status: string }>(
          "select payload->>'status' status from entities where id=$1",
          [id],
        )
      ).rows[0].status,
    ).toBe('published');
  });
  it('retains another customer on a shared device and invalidates derived feedback', async () => {
    await pg.query(
      "insert into journey_events(workspace_id,brand_id,event_id,occurred_at,type,anonymous_id,customer_id,source) values($1,$2,'a',now(),'identify','shared','customer-a','server'),($1,$2,'b',now(),'identify','shared','customer-b','server'),($1,$2,'anonymous',now(),'page_view','shared',null,'browser')",
      [workspace, brand],
    );
    await pg.query(
      "insert into feedback(workspace_id,brand_id,source_id,customer_id,body) values($1,$2,'a','customer-a','Private fixture')",
      [workspace, brand],
    );
    await record('feedback_summary', { theme: 'Derived fixture' });
    await pg.query("select delete_customer($1,$2,'customer-a')", [
      workspace,
      brand,
    ]);
    expect(
      (await pg.query('select event_id from journey_events order by event_id'))
        .rows,
    ).toEqual([{ event_id: 'anonymous' }, { event_id: 'b' }]);
    expect((await pg.query('select * from feedback')).rows).toHaveLength(0);
    expect(
      (await pg.query("select * from entities where kind='feedback_summary'"))
        .rows,
    ).toHaveLength(0);
    const receipt = (
      await pg.query<{ details: Record<string, unknown> }>(
        "select details from audit_log where action='customer.deleted'",
      )
    ).rows[0];
    expect(receipt.details).not.toHaveProperty('customerId');
  });
  it('queues persisted campaigns transactionally without a separate delivery call', async () => {
    const id = await record('campaign', { status: 'queued', budget: 3 });
    expect(
      (
        await pg.query<{ name: string }>(
          'select name from workflow_outbox where id=$1',
          [id],
        )
      ).rows[0].name,
    ).toBe('campaign/generate');
  });
  it('serializes rotating credential refresh and rejects stale commits', async () => {
    const id = await record('connection', { platform: 'x' }),
      first = crypto.randomUUID(),
      second = crypto.randomUUID();
    await pg.query(
      "insert into credentials(entity_id,encrypted) values($1,'fixture-ciphertext')",
      [id],
    );
    expect(
      (
        await pg.query<{ ok: boolean }>(
          'select claim_token_refresh($1,$2) ok',
          [id, first],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await pg.query<{ ok: boolean }>(
          'select claim_token_refresh($1,$2) ok',
          [id, second],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await pg.query<{ ok: boolean }>(
          "select finish_token_refresh($1,$2,1,'stale') ok",
          [id, first],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await pg.query<{ ok: boolean }>(
          "select finish_token_refresh($1,$2,0,'current') ok",
          [id, first],
        )
      ).rows[0].ok,
    ).toBe(true);
  });
  it('enforces assigned-brand and customer-data visibility with RLS', async () => {
    await pg.query(
      "insert into memberships(workspace_id,user_id,role,brand_access) values($1,$2,'viewer','assigned')",
      [workspace, other],
    );
    await record('customers', { customerId: 'private' });
    await pg.exec(
      `set role authenticated;set request.jwt.claim.sub='${other}';`,
    );
    expect((await pg.query('select * from brands')).rows).toHaveLength(0);
    await pg.exec('reset role');
    await pg.query('insert into brand_permissions values($1,$2,$3)', [
      workspace,
      brand,
      other,
    ]);
    await pg.exec(
      `set role authenticated;set request.jwt.claim.sub='${other}';`,
    );
    expect((await pg.query('select * from brands')).rows).toHaveLength(1);
    expect(
      (await pg.query("select * from entities where kind='customers'")).rows,
    ).toHaveLength(0);
  });
  it('keeps period reports correct beyond the shared-state cutoff', async () => {
    await record('spend', {
      spendId: 'old',
      date: '2026-01-03',
      currency: 'USD',
      channel: 'paid',
      category: 'advertising',
      amount: 50,
    });
    const post = crypto.randomUUID();
    await record('metrics', {
      postId: post,
      platform: 'x',
      observedAt: '2026-01-03T00:00:00Z',
      metrics: { impressions: 12, reach: null },
      definitions: {},
    });
    await pg.query(
      "insert into entities(workspace_id,brand_id,kind,payload) select $1,$2,'activity','{}' from generate_series(1,1600)",
      [workspace, brand],
    );
    const report = (
      await pg.query<{
        r: {
          totals: { impressions: number; reach?: number };
          postCount: number;
        };
      }>("select metric_report($1,'2026-01-01','2026-02-01') r", [brand])
    ).rows[0].r;
    expect(report.totals.impressions).toBe(12);
    expect(report.totals.reach).toBeUndefined();
    expect(report.postCount).toBe(1);
    expect(
      (
        await pg.query<{ r: { spend: { amount: number }[] } }>(
          "select period_attribution($1,'2026-01-01','2026-02-01') r",
          [brand],
        )
      ).rows[0].r.spend[0].amount,
    ).toBe(50);
  });
  it('requires all approval stages before issuing the exact-version approval', async () => {
    await pg.query(
      'update workspaces set approval_policy=\'{"stages":["creative","legal"],"separationOfDuties":false,"expiresHours":72}\' where id=$1',
      [workspace],
    );
    const connection = await record('connection', {
        platform: 'x',
        status: 'connected',
      }),
      content = await record('content', {
        status: 'qualified',
        platform: 'x',
        contentHash: 'approved-version',
        review: { score: 9 },
      });
    const args = [workspace, content, connection, owner, 'approved-version'];
    expect(
      (
        await pg.query<{ r: { status: string } }>(
          "select decide_approval($1,$2,$3,$4,$5,'creative') r",
          args,
        )
      ).rows[0].r.status,
    ).toBe('awaiting_stages');
    expect(
      (await pg.query("select * from entities where kind='approval'")).rows,
    ).toHaveLength(0);
    expect(
      (
        await pg.query<{ r: { status: string } }>(
          "select decide_approval($1,$2,$3,$4,$5,'legal') r",
          args,
        )
      ).rows[0].r.status,
    ).toBe('approved');
  });
  it('imports stable identities without duplicating spend', async () => {
    const rows = JSON.stringify([
      {
        spendId: 's1',
        amount: 5,
        currency: 'USD',
        category: 'advertising',
        channel: 'search',
      },
    ]);
    await pg.query("select import_entities($1,$2,'spend',$3)", [
      workspace,
      brand,
      rows,
    ]);
    await pg.query("select import_entities($1,$2,'spend',$3)", [
      workspace,
      brand,
      rows,
    ]);
    expect(
      (await pg.query("select * from entities where kind='spend'")).rows,
    ).toHaveLength(1);
  });
  it('allows a single provider dispatch even after an interrupted worker', async () => {
    const id = await record('schedule', { status: 'publishing', revision: 2 });
    expect(
      (
        await pg.query<{ ok: boolean }>(
          'select claim_provider_dispatch($1,1) ok',
          [id],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await pg.query<{ ok: boolean }>(
          'select claim_provider_dispatch($1,2) ok',
          [id],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await pg.query<{ ok: boolean }>(
          'select claim_provider_dispatch($1,2) ok',
          [id],
        )
      ).rows[0].ok,
    ).toBe(false);
  });
  it('locks approved destination changes', async () => {
    const connection = await record('connection', {
        platform: 'x',
        status: 'connected',
      }),
      content = await record('content', {
        status: 'qualified',
        platform: 'x',
        contentHash: 'locked',
        review: { score: 9 },
      });
    await pg.query('select approve_content($1,$2,$3,$4,$5)', [
      workspace,
      content,
      connection,
      owner,
      'locked',
    ]);
    await expect(
      pg.query("select connection_destination($1,$2,'changed')", [
        workspace,
        connection,
      ]),
    ).rejects.toThrow('bound');
  });
  it('keeps ambiguous identities separate and calculates ordered funnels', async () => {
    for (const [eventId, type, at, anon, customer] of [
      ['v', 'page_view', '2026-01-01', 'a', null],
      ['i', 'identify', '2026-01-02', 'a', 'c'],
      ['e', 'engaged', '2026-01-03', null, 'c'],
      ['p', 'purchase', '2026-01-04', null, 'c'],
    ]) {
      await pg.query(
        "insert into journey_events(workspace_id,brand_id,event_id,occurred_at,type,anonymous_id,customer_id,amount,currency,order_id,source) values($1,$2,$3,$4,$5,$6,$7,10,'USD',$3,'server')",
        [workspace, brand, eventId, at, type, anon, customer],
      );
    }
    expect(
      (
        await pg.query<{
          f: { visitors: number; engaged: number; purchasers: number };
        }>('select journey_funnel($1) f', [brand])
      ).rows[0].f,
    ).toMatchObject({ visitors: 1, engaged: 1, purchasers: 1 });
    await pg.query(
      "insert into journey_events(workspace_id,brand_id,event_id,occurred_at,type,anonymous_id,customer_id,source) values($1,$2,'ambiguous',now(),'identify','a','different','server')",
      [workspace, brand],
    );
    expect(
      (
        await pg.query<{ journey_id: string }>(
          "select journey_id from resolved_events where event_id='v'",
        )
      ).rows[0].journey_id,
    ).toBe('anonymous:a');
  });
  it('settles measured usage and pauses underestimated workspace costs', async () => {
    const id = crypto.randomUUID();
    await pg.query("select reserve_budget($1,$2,null,1,'TEXT')", [
      id,
      workspace,
    ]);
    await pg.query('select settle_budget($1,2)', [id]);
    expect(
      (
        await pg.query<{ monthly_limit: string }>(
          'select monthly_limit from workspaces where id=$1',
          [workspace],
        )
      ).rows[0].monthly_limit,
    ).toBe('0.0000');
  });
  it('enforces workspace isolation and denies direct client writes', async () => {
    await record('dna', { name: 'Private fixture' });
    await pg.exec(
      `set role authenticated;set request.jwt.claim.sub='${other}';`,
    );
    expect((await pg.query('select * from brands')).rows).toHaveLength(0);
    expect((await pg.query('select * from entities')).rows).toHaveLength(0);
    await expect(
      pg.query(
        "insert into entities(workspace_id,brand_id,kind,payload) values($1,$2,'dna','{}')",
        [workspace, brand],
      ),
    ).rejects.toThrow();
    await pg.exec(`set request.jwt.claim.sub='${owner}';`);
    expect((await pg.query('select * from brands')).rows).toHaveLength(1);
  });
  it('prevents clients calling elevated approval functions', async () => {
    await pg.exec(
      `set role authenticated;set request.jwt.claim.sub='${owner}';`,
    );
    await expect(
      pg.query('select approve_content($1,$2,$3,$4,$5)', [
        workspace,
        crypto.randomUUID(),
        crypto.randomUUID(),
        owner,
        'hash',
      ]),
    ).rejects.toThrow('permission denied');
  });
  it('atomically respects campaign and workspace spending limits', async () => {
    const campaign = await record('campaign', { budget: 5 });
    await pg.query("select reserve_budget($1,$2,$3,4,'test')", [
      crypto.randomUUID(),
      workspace,
      campaign,
    ]);
    await expect(
      pg.query("select reserve_budget($1,$2,$3,2,'test')", [
        crypto.randomUUID(),
        workspace,
        campaign,
      ]),
    ).rejects.toThrow('Campaign spending limit');
    await expect(
      pg.query("select reserve_budget($1,$2,null,7,'test')", [
        crypto.randomUUID(),
        workspace,
      ]),
    ).rejects.toThrow('Monthly spending limit');
    expect(
      (await pg.query<{ sum: string }>('select sum(amount) from budget_ledger'))
        .rows[0].sum,
    ).toBe('4.0000');
  });
  it('reserves an idempotency key only once', async () => {
    const id = crypto.randomUUID();
    await pg.query("select reserve_budget($1,$2,null,4,'test')", [
      id,
      workspace,
    ]);
    await pg.query("select reserve_budget($1,$2,null,4,'test')", [
      id,
      workspace,
    ]);
    expect((await pg.query('select * from budget_ledger')).rows).toHaveLength(
      1,
    );
  });
  it('rejects below-threshold and stale approval hashes', async () => {
    const connection = await record('connection', {
      platform: 'x',
      status: 'connected',
    });
    const content = await record('content', {
      status: 'qualified',
      platform: 'x',
      contentHash: 'exact',
      review: { score: 8.69 },
    });
    await expect(
      pg.query('select approve_content($1,$2,$3,$4,$5)', [
        workspace,
        content,
        connection,
        owner,
        'exact',
      ]),
    ).rejects.toThrow('qualifying');
    await pg.query(
      "update entities set payload=jsonb_set(payload,'{review,score}','8.7') where id=$1",
      [content],
    );
    await expect(
      pg.query('select approve_content($1,$2,$3,$4,$5)', [
        workspace,
        content,
        connection,
        owner,
        'different',
      ]),
    ).rejects.toThrow('qualifying');
    await pg.query('select approve_content($1,$2,$3,$4,$5)', [
      workspace,
      content,
      connection,
      owner,
      'exact',
    ]);
  });
  it('supersedes old schedule revisions and prevents duplicate publication claims', async () => {
    const connection = await record('connection', {
        platform: 'x',
        status: 'connected',
      }),
      content = await record('content', {
        status: 'qualified',
        platform: 'x',
        contentHash: 'exact',
        review: { score: 9 },
      });
    const approval = (
      await pg.query<{ id: string }>(
        'select approve_content($1,$2,$3,$4,$5) id',
        [workspace, content, connection, owner, 'exact'],
      )
    ).rows[0].id;
    const id = (
      await pg.query<{ id: string }>(
        "select schedule_post($1,$2,now()+interval '1 hour','Asia/Kolkata') id",
        [workspace, approval],
      )
    ).rows[0].id;
    await expect(
      pg.query(
        "select schedule_post($1,$2,now()+interval '2 hour','Asia/Kolkata')",
        [workspace, approval],
      ),
    ).rejects.toThrow('already');
    await pg.query(
      "select change_schedule($1,$2,'reschedule',now()+interval '2 hour','Asia/Kolkata')",
      [workspace, id],
    );
    await pg.query(
      "update entities set payload=jsonb_set(payload,'{scheduledAt}',to_jsonb(now()-interval '1 minute')) where id=$1",
      [id],
    );
    expect(
      (
        await pg.query<{ claim: unknown }>(
          'select claim_publication($1,1) claim',
          [id],
        )
      ).rows[0].claim,
    ).toBeNull();
    expect(
      (
        await pg.query<{ claim: unknown }>(
          'select claim_publication($1,2) claim',
          [id],
        )
      ).rows[0].claim,
    ).not.toBeNull();
    expect(
      (
        await pg.query<{ claim: unknown }>(
          'select claim_publication($1,2) claim',
          [id],
        )
      ).rows[0].claim,
    ).toBeNull();
    await expect(
      pg.query("select change_schedule($1,$2,'cancel')", [workspace, id]),
    ).rejects.toThrow('dispatched');
  });
  it('rejects browser purchases at the database boundary', async () => {
    await expect(
      pg.query(
        "insert into journey_events(workspace_id,brand_id,event_id,occurred_at,type,customer_id,amount,currency,order_id,source) values($1,$2,'e',now(),'purchase','c',10,'USD','order','browser')",
        [workspace, brand],
      ),
    ).rejects.toThrow();
  });
  it('calculates attribution and refunds without blending currencies', async () => {
    for (const e of [
      ['touch1', '2026-01-01', 'click', 'search', null, null, null],
      ['touch2', '2026-01-02', 'click', 'social', null, null, null],
      ['purchase', '2026-01-03', 'purchase', 'direct', 100, 'USD', 'o1'],
      ['refund', '2026-01-04', 'refund', 'direct', 20, 'USD', 'o1'],
      ['purchase2', '2026-01-05', 'purchase', 'direct', 500, 'INR', 'o2'],
    ])
      await pg.query(
        "insert into journey_events(workspace_id,brand_id,event_id,occurred_at,type,customer_id,channel,amount,currency,order_id,source) values($1,$2,$3,$4,$5,'c',$6,$7,$8,$9,'import')",
        [workspace, brand, ...e],
      );
    const r = (
      await pg.query<{
        report: {
          channels: { channel: string; currency: string; linear: number }[];
          revenue: { currency: string; revenue: number }[];
        };
      }>('select attribution_report($1,30) report', [brand])
    ).rows[0].report;
    expect(
      r.channels.find((c) => c.channel === 'search' && c.currency === 'USD')
        ?.linear,
    ).toBe(40);
    expect(r.revenue.find((c) => c.currency === 'USD')?.revenue).toBe(80);
    expect(r.revenue.find((c) => c.currency === 'INR')?.revenue).toBe(500);
  });
  it('consumes an OAuth state once and deletes associated private data', async () => {
    const id = await record('oauth_state', {
      platform: 'x',
      expiresAt: Date.now() + 300000,
      verifier: 'encrypted',
    });
    expect(
      (
        await pg.query<{ state: unknown }>(
          "select consume_oauth_state($1,'x') state",
          [id],
        )
      ).rows[0].state,
    ).not.toBeNull();
    expect(
      (
        await pg.query<{ state: unknown }>(
          "select consume_oauth_state($1,'x') state",
          [id],
        )
      ).rows[0].state,
    ).toBeNull();
  });
});
