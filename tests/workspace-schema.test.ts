import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('../lib/server/db', () => ({
  ...boundary,
  db: vi.fn(),
  scope: vi.fn(),
  entity: vi.fn(),
  insertEntity: vi.fn(),
  updateEntity: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('../lib/server/workflows', () => ({ dispatch: vi.fn() }));
vi.mock('../lib/server/recovery', () => ({ reconcilePublication: vi.fn() }));
import { POST } from '../app/api/[action]/route';

const owner = '11111111-1111-4111-8111-111111111111';
const workspace = '22222222-2222-4222-8222-222222222222';
let requests: Request[];

function request(body: Record<string, unknown>) {
  return new Request('https://example.com/api/workspace', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer user-token-fixture',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  requests = [];
  boundary.authenticate.mockResolvedValue({ id: owner });
  vi.stubEnv('SUPABASE_URL', 'https://project-fixture.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'publishable-key-fixture');
  vi.stubEnv('SUPABASE_DB_SCHEMA', 'brandcurrent');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const outgoing = new Request(input, init);
      requests.push(outgoing);
      return Response.json(
        outgoing.url.endsWith('/create_workspace') ? workspace : null,
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('workspace RPC schema routing (mocked HTTP boundary)', () => {
  it.each([
    {
      body: { name: 'My workspace' },
      rpc: 'create_workspace',
      payload: { p_name: 'My workspace' },
    },
    { body: { accept: true }, rpc: 'accept_invitations', payload: {} },
  ])(
    'routes $rpc to the isolated schema with the verified user token',
    async ({ body, rpc, payload }) => {
      const response = await POST(request(body), {
        params: Promise.resolve({ action: 'workspace' }),
      });
      expect(response.status).toBe(200);
      expect(requests).toHaveLength(1);
      const outgoing = requests[0];
      expect(outgoing.url).toBe(
        `https://project-fixture.supabase.co/rest/v1/rpc/${rpc}`,
      );
      expect(outgoing.headers.get('Content-Profile')).toBe('brandcurrent');
      expect(outgoing.headers.get('Authorization')).toBe(
        'Bearer user-token-fixture',
      );
      expect(outgoing.headers.get('apikey')).toBe('publishable-key-fixture');
      expect(await outgoing.json()).toEqual(payload);
    },
  );

  it('keeps the default public schema for independent installations', async () => {
    vi.stubEnv('SUPABASE_DB_SCHEMA', '');
    const response = await POST(request({ name: 'My workspace' }), {
      params: Promise.resolve({ action: 'workspace' }),
    });
    expect(response.status).toBe(200);
    expect(requests[0].headers.get('Content-Profile')).toBe('public');
  });

  it('does not contact the database when user authentication fails', async () => {
    boundary.authenticate.mockRejectedValue(
      Object.assign(new Error('Sign in to your workspace.'), { status: 401 }),
    );
    const response = await POST(request({ accept: true }), {
      params: Promise.resolve({ action: 'workspace' }),
    });
    expect(response.status).toBe(401);
    expect(requests).toHaveLength(0);
  });
});
