import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  scope: vi.fn(), db: vi.fn(), rpc: vi.fn(), entity: vi.fn(),
  authenticate: vi.fn(), insertEntity: vi.fn(), updateEntity: vi.fn(),
  storeAsset: vi.fn(), assetUrl: vi.fn(), dispatch: vi.fn(),
  exchange: vi.fn(), identity: vi.fn(), decrypt: vi.fn(), encrypt: vi.fn(),
}));
vi.mock('@/lib/server/db', () => mocks);
vi.mock('@/lib/server/env', () => ({
  env: (_name: string, fallback = '') => fallback,
  required: (name: string) => name === 'APP_ORIGIN' ? 'https://app.example' : 'configured',
}));
vi.mock('@/lib/server/workflows', () => ({ dispatch: mocks.dispatch }));
vi.mock('@/lib/server/recovery', () => ({ reconcilePublication: vi.fn() }));
vi.mock('@/lib/server/social', () => ({
  capabilities: { x: { formats: ['text'] } },
  authorizationUrl: vi.fn(), exchange: mocks.exchange, identity: mocks.identity,
}));
vi.mock('@/lib/server/security', () => ({
  validatePublicUrl: vi.fn(), encrypt: mocks.encrypt, decrypt: mocks.decrypt,
}));
import { POST as action } from '@/app/api/[action]/route';
import { POST as assets } from '@/app/api/assets/route';
import { POST as governance } from '@/app/api/governance/route';
import { GET as media } from '@/app/api/media/route';
import { GET as oauth } from '@/app/api/oauth/[platform]/callback/route';

const workspace = '11111111-1111-4111-8111-111111111111';
const brand = '22222222-2222-4222-8222-222222222222';
const record = '33333333-3333-4333-8333-333333333333';
const user = '44444444-4444-4444-8444-444444444444';
const secretError = new Error('private database password and provider token');
const errorBody = z.object({ error: z.string(), code: z.string(), requestId: z.uuid() });
type QueryResult = { data: unknown; error: Error | null };
class Query implements PromiseLike<QueryResult> {
  constructor(private result: QueryResult) {}
  select = vi.fn(() => this);
  eq = vi.fn((_column: string, _value: unknown) => this);
  in = vi.fn(() => this);
  order = vi.fn(() => this);
  limit = vi.fn(() => this);
  update = vi.fn(() => this);
  insert = vi.fn(() => this);
  upsert = vi.fn(() => this);
  single = vi.fn(async () => this.result);
  maybeSingle = vi.fn(async () => this.result);
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}
function mockDatabase(result: QueryResult) {
  const query = new Query(result);
  mocks.db.mockReturnValue({ from: vi.fn(() => query) });
  return query;
}
function request(body: unknown, route = 'test') {
  return new Request(`https://app.example/api/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer fixture' },
    body: JSON.stringify(body),
  });
}
const run = (name: string, body: unknown) => action(request(body, name), {
  params: Promise.resolve({ action: name }),
});
const eventCsv = (eventId: string, campaignId = '') =>
  `eventId,occurredAt,type,anonymousId,campaignId\n${eventId},2026-10-22T00:00:00Z,page_view,visitor,${campaignId}`;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.scope.mockResolvedValue({ workspaceId: workspace, role: 'owner', user: { id: user }, customerAccess: true });
  mocks.rpc.mockResolvedValue(true);
  mocks.dispatch.mockResolvedValue(undefined);
  mockDatabase({ data: null, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe('write-route authorization and safe failures (mocked services)', () => {
  it('stops before writes when reference authorization lookup fails, even with partial data', async () => {
    mockDatabase({ data: { brand_id: brand }, error: secretError });
    const response = await run('dna', { id: record });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(secretError.message);
    expect(mocks.entity).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.insertEntity).not.toHaveBeenCalled();
  });
  it('stops when a reference is missing or not accessible to this workspace', async () => {
    const response = await run('dna', { id: record });
    expect(response.status).toBe(404);
    expect(mocks.entity).not.toHaveBeenCalled();
    expect(mocks.insertEntity).not.toHaveBeenCalled();
  });
  it('denies a reference to another restricted brand before business commands', async () => {
    mockDatabase({ data: { brand_id: brand }, error: null });
    mocks.rpc.mockResolvedValue(false);
    expect((await run('dna', { id: record })).status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('brand_access_for_user', { p_brand: brand, p_user: user });
    expect(mocks.entity).not.toHaveBeenCalled();
  });
  it.each([null, [], 'private input'])(
    'rejects non-object action input before authentication: %j', async (body) => {
      const response = await run('settings', body);
      expect(response.status).toBe(400);
      expect(mocks.scope).not.toHaveBeenCalled();
      expect(errorBody.parse(await response.json()).error).not.toContain('private input');
    },
  );
  it('keeps deliberate validation guidance without reflecting private validation input', async () => {
    const missingBrand = await run('tracking', {});
    expect(missingBrand.status).toBe(400);
    expect(errorBody.parse(await missingBrand.json()).error).toBe('Select a brand.');
    const invalid = await run('settings', { name: 'private-input', monthlyLimit: 'private-input' });
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).not.toContain('private-input');
  });
  it('treats a failed DNA read as an unavailable backend rather than missing brand analysis', async () => {
    const query = mockDatabase({ data: null, error: secretError });
    const response = await run('campaign', {
      brandId: brand, formats: ['text'], platforms: ['x'], idea: 'A grounded campaign',
      audience: 'Existing customers', scenario: 'Product launch', event: 'Launch',
      budget: 20,
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/private database|Analyze your website/);
    expect(query.eq).toHaveBeenCalledWith('workspace_id', workspace);
    expect(query.eq).toHaveBeenCalledWith('brand_id', brand);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('rejects reserved browser event IDs before importing or scheduling insights', async () => {
    const query = mockDatabase({ data: [], error: null });
    const response = await run('imports', { brandId: brand, kind: 'events', csv: eventCsv('browser:untrusted') });
    expect(response.status).toBe(400);
    expect(query.upsert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('requires imported campaign references to belong to this brand and workspace', async () => {
    const query = mockDatabase({ data: [], error: null });
    const response = await run('imports', { brandId: brand, kind: 'events', csv: eventCsv('trusted-event', record) });
    expect(response.status).toBe(400);
    expect(query.eq).toHaveBeenCalledWith('workspace_id', workspace);
    expect(query.eq).toHaveBeenCalledWith('brand_id', brand);
    expect(query.eq).toHaveBeenCalledWith('kind', 'campaign');
    expect(query.upsert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('does not import after a failed campaign lookup', async () => {
    const query = mockDatabase({ data: [{ id: record }], error: secretError });
    const response = await run('imports', { brandId: brand, kind: 'events', csv: eventCsv('trusted-event', record) });
    expect(response.status).toBe(500);
    expect(query.upsert).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(secretError.message);
  });
  it('allows valid imports without changing their trusted event IDs', async () => {
    const query = mockDatabase({ data: [{ id: record }], error: null });
    const response = await run('imports', { brandId: brand, kind: 'events', csv: eventCsv('trusted-event', record) });
    expect(response.status).toBe(200);
    expect(query.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ event_id: 'trusted-event', source: 'import', brand_id: brand })],
      { onConflict: 'brand_id,event_id', ignoreDuplicates: true },
    );
  });
  it('fails a retry job lookup closed and never resets attempts after an error', async () => {
    const query = mockDatabase({ data: { data: { workspaceId: workspace } }, error: secretError });
    const response = await governance(request({ action: 'retry-job', id: 'job-key' }));
    expect(response.status).toBe(500);
    expect(query.eq).toHaveBeenCalledWith('data->>workspaceId', workspace);
    expect(query.update).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(secretError.message);
  });
  it.each([null, { data: null }, { data: { workspaceId: 'another-workspace' } }])(
    'never retries missing or foreign jobs: %j', async (data) => {
      const query = mockDatabase({ data, error: null });
      const response = await governance(request({ action: 'retry-job', id: 'job-key' }));
      expect(response.status).toBe(404);
      expect(query.update).not.toHaveBeenCalled();
      expect(query.insert).not.toHaveBeenCalled();
    },
  );
  it('keeps workspace scoping on the retry write as well as the lookup', async () => {
    const query = mockDatabase({ data: { data: { workspaceId: workspace } }, error: null });
    const response = await governance(request({ action: 'retry-job', id: 'job-key' }));
    expect(response.status).toBe(200);
    expect(query.eq.mock.calls.filter(([column, value]) => column === 'data->>workspaceId' && value === workspace)).toHaveLength(2);
    expect(query.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ attempts: 0, dead_at: null }));
  });
  it('does not report a successful retry when its update fails', async () => {
    const lookup = new Query({ data: { data: { workspaceId: workspace } }, error: null });
    const mutation = new Query({ data: null, error: secretError });
    const from = vi.fn().mockReturnValueOnce(lookup).mockReturnValueOnce(mutation);
    mocks.db.mockReturnValue({ from });
    const response = await governance(request({ action: 'retry-job', id: 'job-key' }));
    expect(response.status).toBe(500);
    expect(from).toHaveBeenCalledTimes(2);
    expect(await response.text()).not.toContain(secretError.message);
  });
  it('never caches a freshly issued tracking webhook secret', async () => {
    mocks.insertEntity.mockResolvedValue({ id: record });
    mocks.encrypt.mockResolvedValue('ciphertext');
    const response = await run('tracking', { brandId: brand });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private,no-store');
  });
  it('never uploads an asset after an authorization error', async () => {
    mocks.scope.mockRejectedValue(secretError);
    const response = await assets(new Request('https://app.example/api/assets', {
      method: 'POST', headers: { 'x-brand-id': brand }, body: 'test',
    }));
    expect(response.status).toBe(500);
    expect(mocks.storeAsset).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(secretError.message);
  });
});

describe('private media access', () => {
  function mediaRecord(assetPath = `${workspace}/${brand}/image.png`, brandId: string | null = brand) {
    mocks.entity.mockResolvedValue({ id: record, workspace_id: workspace, brand_id: brandId, payload: { status: 'qualified', assetPath } });
    mocks.assetUrl.mockResolvedValue('https://storage.example/signed?token=temporary');
    return new Request(`https://app.example/api/media?id=${record}`);
  }
  it('checks brand access and prevents caching the signed URL response', async () => {
    const response = await media(mediaRecord());
    expect(response.status).toBe(200);
    expect(mocks.scope).toHaveBeenLastCalledWith(expect.any(Request), brand);
    expect(response.headers.get('cache-control')).toBe('private,no-store');
    expect(mocks.assetUrl).toHaveBeenCalledWith(`${workspace}/${brand}/image.png`, 300);
  });
  it.each([
    `other-workspace/${brand}/image.png`,
    `${workspace}/other-brand/image.png`,
    `${workspace}/${brand}/../image.png`,
    `${workspace}/${brand}/..%2Fimage.png`,
  ])('never signs a path outside the authorized content scope: %s', async (path) => {
    expect((await media(mediaRecord(path))).status).toBe(404);
    expect(mocks.assetUrl).not.toHaveBeenCalled();
  });
  it('does not serve media without a brand scope', async () => {
    expect((await media(mediaRecord('image.png', null))).status).toBe(404);
    expect(mocks.assetUrl).not.toHaveBeenCalled();
  });
});

describe('OAuth callback authorization', () => {
  it('does not exchange tokens when the owner lookup fails, even if data is present', async () => {
    mocks.rpc.mockResolvedValue({ workspace_id: workspace, brand_id: brand, payload: { userId: user, verifier: 'encrypted', platform: 'x' } });
    mockDatabase({ data: { role: 'owner' }, error: secretError });
    const response = await oauth(new Request(`https://app.example/api/oauth/x/callback?state=${record}&code=private-code`, {
      headers: { cookie: `bc_oauth_x=${record}` },
    }), { params: Promise.resolve({ platform: 'x' }) });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).not.toMatch(/private|password|provider.token/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.identity).not.toHaveBeenCalled();
  });
  it('denies a callback if owner membership has been revoked', async () => {
    mocks.rpc.mockResolvedValue({ workspace_id: workspace, brand_id: brand, payload: { userId: user, verifier: 'encrypted', platform: 'x' } });
    const response = await oauth(new Request(`https://app.example/api/oauth/x/callback?state=${record}&code=private-code`, {
      headers: { cookie: `bc_oauth_x=${record}` },
    }), { params: Promise.resolve({ platform: 'x' }) });
    expect(response.status).toBe(303);
    expect(decodeURIComponent(response.headers.get('location') ?? '')).toContain('Workspace owner access is required.');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it('does not reflect a provider failure or its token in the redirect URL', async () => {
    mocks.rpc.mockResolvedValue({ workspace_id: workspace, brand_id: brand, payload: { userId: user, verifier: 'encrypted', platform: 'x' } });
    mockDatabase({ data: { role: 'owner' }, error: null });
    mocks.exchange.mockRejectedValue(secretError);
    const response = await oauth(new Request(`https://app.example/api/oauth/x/callback?state=${record}&code=private-code`, {
      headers: { cookie: `bc_oauth_x=${record}` },
    }), { params: Promise.resolve({ platform: 'x' }) });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).not.toMatch(/private|password|provider.token/);
    expect(mocks.identity).not.toHaveBeenCalled();
  });
});
