import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), createClient: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/server/env', () => ({
  env: (_name: string, fallback = '') => fallback,
  required: (name: string) => name,
}));
import { scope } from '@/lib/server/db';

const workspace = '11111111-1111-4111-8111-111111111111';
const brand = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const backendError = new Error('database lookup failed');
function query(result: { data: unknown; error: Error | null }) {
  const value = {
    select: vi.fn(), eq: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(async () => result),
  };
  value.select.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  value.limit.mockReturnValue(value);
  return value;
}
const membership = () => query({
  data: {
    workspace_id: workspace, role: 'editor', brand_access: 'selected',
    customer_access: false, export_access: false,
    workspaces: { require_mfa: false, session_hours: 24 },
  },
  error: null,
});
const request = () => new Request('https://app.example/api/state', {
  headers: {
    authorization: `Bearer header.${Buffer.from(JSON.stringify({ aal: 'aal1' })).toString('base64url')}.signature`,
    'x-workspace-id': workspace,
  },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockReturnValue({
    auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc,
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: user } }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe('database scope checks with mocked authentication and queries', () => {
  it.each([null, { id: brand }])('fails closed when a brand lookup returns an error: %j', async (data) => {
    mocks.from.mockReturnValueOnce(membership()).mockReturnValueOnce(query({ data, error: backendError }));
    await expect(scope(request(), brand)).rejects.toBe(backendError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires the selected brand to belong to the authenticated workspace', async () => {
    const lookup = query({ data: null, error: null });
    mocks.from.mockReturnValueOnce(membership()).mockReturnValueOnce(lookup);
    await expect(scope(request(), brand)).rejects.toMatchObject({ status: 404 });
    expect(lookup.eq).toHaveBeenCalledWith('workspace_id', workspace);
    expect(lookup.eq).toHaveBeenCalledWith('id', brand);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not grant brand access when the permission query fails with partial data', async () => {
    mocks.from.mockReturnValueOnce(membership()).mockReturnValueOnce(query({ data: { id: brand }, error: null }));
    mocks.rpc.mockResolvedValue({ data: true, error: backendError });
    await expect(scope(request(), brand)).rejects.toThrow(backendError.message);
  });
  it('preserves a permitted scoped session after successful checks', async () => {
    mocks.from.mockReturnValueOnce(membership()).mockReturnValueOnce(query({ data: { id: brand }, error: null }));
    await expect(scope(request(), brand)).resolves.toMatchObject({ workspaceId: workspace, role: 'editor' });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('brand_access_for_user', { p_brand: brand, p_user: user });
  });
});
