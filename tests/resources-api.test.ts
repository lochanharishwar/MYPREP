import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
const errorBody = z.object({
  error: z.string(),
  code: z.string(),
  requestId: z.uuid(),
});
const resourceBody = z.object({
  groups: z.array(
    z.object({ total: z.number(), nextCursor: z.string().nullable() }),
  ),
});
const mocks = vi.hoisted(() => ({ scope: vi.fn(), rpc: vi.fn(), db: vi.fn() }));
vi.mock('../lib/server/db', () => mocks);
import { GET } from '../app/api/resources/route';
const brand = '11111111-1111-4111-8111-111111111111';
const workspace = '22222222-2222-4222-8222-222222222222';
const request = (extra = '') =>
  new Request(
    `https://example.com/api/resources?brandId=${brand}&kinds=page${extra}`,
    { headers: { Authorization: 'Bearer test-fixture' } },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue({
    workspaceId: workspace,
    customerAccess: true,
  });
  mocks.rpc.mockResolvedValue({ rows: [], total: 0, hasMore: false });
});
afterEach(() => vi.restoreAllMocks());
describe('page insight HTTP contract (mocked database boundary)', () => {
  it('returns true empty results and passes bounded literal search to the authorized scope', async () => {
    const response = await GET(request('&q=20%25_&limit=10'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private,no-store');
    expect(await response.json()).toEqual({
      groups: [{ kind: 'page', rows: [], total: 0, nextCursor: null }],
    });
    expect(mocks.scope).toHaveBeenCalledWith(expect.any(Request), brand);
    expect(mocks.rpc).toHaveBeenCalledWith('search_page_insights', {
      p_workspace: workspace,
      p_brand: brand,
      p_query: '20%_',
      p_limit: 10,
      p_after_at: null,
      p_after_id: null,
    });
  });
  it.each([401, 403, 404])(
    'does not query records after a %s scope rejection',
    async (status) => {
      mocks.scope.mockRejectedValue(
        Object.assign(new Error('Access denied.'), { status }),
      );
      const response = await GET(request());
      expect(response.status).toBe(status);
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.db).not.toHaveBeenCalled();
    },
  );
  it.each(['&limit=101', '&q=' + 'a'.repeat(201), '&cursor=not-json'])(
    'rejects malformed or unbounded query %s',
    async (extra) => {
      const response = await GET(request(extra));
      expect(response.status).toBe(400);
      expect(errorBody.parse(await response.json()).code).toBe('INVALID_QUERY');
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it('keeps backend failures distinct from zero findings and redacts internals', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rpc.mockRejectedValue(
      new Error('private SQL schema and credential details'),
    );
    const response = await GET(request());
    expect(response.status).toBe(500);
    const body = errorBody.parse(await response.json());
    expect(body.code).toBe('UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('private SQL');
    expect(body.requestId).toBeTruthy();
    expect(log).toHaveBeenCalledWith('resources_request_failed', {
      requestId: body.requestId,
    });
  });
  it('returns a cursor only when another page exists and roundtrips the tie-breaker', async () => {
    const row = {
      id: brand,
      created_at: '2026-09-01T00:00:00.000Z',
      payload: {},
    };
    mocks.rpc.mockResolvedValue({ rows: [row], total: 26, hasMore: true });
    const result = resourceBody.parse(await (await GET(request())).json());
    expect(result.groups[0].total).toBe(26);
    const cursor = result.groups[0].nextCursor;
    await GET(request('&cursor=' + encodeURIComponent(cursor!)));
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'search_page_insights',
      expect.objectContaining({
        p_after_at: row.created_at,
        p_after_id: brand,
      }),
    );
    mocks.rpc.mockResolvedValue({ rows: [row], total: 26, hasMore: false });
    expect(
      resourceBody.parse(await (await GET(request())).json()).groups[0]
        .nextCursor,
    ).toBeNull();
  });
});
