import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  entity: vi.fn(),
  db: vi.fn(),
}));
vi.mock('../lib/server/db', () => mocks);
import { GET } from '../app/api/timing/route';
const brand = '11111111-1111-4111-8111-111111111111';
const account = '22222222-2222-4222-8222-222222222222';
const req = () =>
  new Request(
    `https://example.com/api/timing?brandId=${brand}&accountId=${account}`,
  );
function query(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of ['from', 'select', 'eq', 'gte', 'lte', 'order', 'or'])
    chain[key] = vi.fn(() => chain);
  chain.limit = vi.fn(async () => result);
  return chain;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue({ workspaceId: 'workspace' });
  mocks.entity.mockResolvedValue({
    brand_id: brand,
    payload: { platform: 'x' },
  });
});
describe('timing history API (mocked database boundary)', () => {
  it('denies foreign brands before querying history', async () => {
    mocks.entity.mockResolvedValue({ brand_id: 'foreign' });
    expect((await GET(req())).status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('does not query data after membership rejection', async () => {
    mocks.scope.mockRejectedValue(
      Object.assign(new Error('denied'), { status: 403 }),
    );
    expect((await GET(req())).status).toBe(403);
    expect(mocks.entity).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('returns genuine empty history with explicit scope and bounds', async () => {
    const q = query({ data: [], count: 0, error: null });
    mocks.db.mockReturnValue(q);
    const response = await GET(req());
    expect(await response.json()).toEqual({
      posts: [],
      observations: [],
      partial: false,
      totalPosts: 0,
    });
    expect(q.eq).toHaveBeenCalledWith('workspace_id', 'workspace');
    expect(q.eq).toHaveBeenCalledWith('brand_id', brand);
    expect(q.eq).toHaveBeenCalledWith('payload->>accountId', account);
    expect(q.limit).toHaveBeenCalledWith(200);
  });
  it('queries bounded comparable windows and reports truncated coverage', async () => {
    const at = new Date(Date.now() - 3 * 86400000).toISOString();
    const row = {
      id: brand,
      workspace_id: 'workspace',
      brand_id: brand,
      kind: 'schedule',
      payload: {
        publishedAt: at,
        accountId: account,
        platform: 'x',
        status: 'published',
      },
    };
    const posts = query({ data: [row], count: 201, error: null });
    posts.limit
      .mockResolvedValueOnce({ data: [row], count: 201, error: null })
      .mockResolvedValueOnce({ data: [], count: 1001, error: null });
    mocks.db.mockReturnValue(posts);
    const response = await GET(req());
    expect(await response.json()).toMatchObject({
      partial: true,
      totalPosts: 201,
    });
    expect(posts.limit).toHaveBeenCalledWith(1000);
    expect(posts.or).toHaveBeenCalledWith(
      expect.stringContaining(`payload->>postId.eq.${brand}`),
    );
    expect(posts.or).toHaveBeenCalledWith(
      expect.stringContaining(
        new Date(Date.parse(at) + 86400000).toISOString(),
      ),
    );
    expect(posts.eq).toHaveBeenCalledWith('workspace_id', 'workspace');
    expect(posts.eq).toHaveBeenCalledWith('brand_id', brand);
  });
  it('keeps errors separate from empty history and redacts internals', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.db.mockReturnValue(
      query({ data: null, error: new Error('private database details') }),
    );
    const response = await GET(req());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(
      'private database details',
    );
    log.mockRestore();
  });
});
