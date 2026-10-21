import { afterEach, describe, expect, it, vi } from 'vitest';
import { serviceStatus } from '@/lib/server/service-status';

afterEach(() => vi.unstubAllEnvs());
describe('server setup status', () => {
  it('reports missing custom storage settings without failing the config response', () => {
    vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'fixture');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture');
    vi.stubEnv('SUPABASE_DB_SCHEMA', 'brandcurrent');
    vi.stubEnv('SUPABASE_MEDIA_BUCKET', '');
    vi.stubEnv('SUPABASE_PUBLISHED_MEDIA_BUCKET', '');
    const workspace = () =>
      serviceStatus().find((entry) => entry.name === 'Server workspace');
    expect(workspace()).toMatchObject({ ready: false });
    expect(workspace()?.detail).toContain(
      'SUPABASE_MEDIA_BUCKET must be configured',
    );
    vi.stubEnv('SUPABASE_MEDIA_BUCKET', 'brandcurrent-media');
    vi.stubEnv(
      'SUPABASE_PUBLISHED_MEDIA_BUCKET',
      'brandcurrent-published-media',
    );
    expect(workspace()).toMatchObject({ ready: true });
    expect(workspace()?.detail).toContain('require verification');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(workspace()?.ready).toBe(false);
    expect(workspace()?.detail).toContain('credentials are missing');
  });
});
