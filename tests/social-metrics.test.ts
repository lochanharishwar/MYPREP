import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  metrics,
  authorizationUrl,
  type Connection,
} from '@/lib/server/social';
import type { Entity } from '@/lib/contracts';
const conn: Entity<Connection> = {
  id: 'connection',
  workspace_id: 'workspace',
  brand_id: 'brand',
  kind: 'connection',
  payload: {
    platform: 'youtube',
    accountId: 'channel',
    name: 'Channel',
    status: 'connected',
  },
  created_at: '2026-09-01',
  updated_at: '2026-09-01',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('YouTube scopes and observations', () => {
  it('requests permission to change uploaded videos to public', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example');
    vi.stubEnv('YOUTUBE_CLIENT_ID', 'fixture');
    vi.stubEnv('YOUTUBE_SCOPES', '');
    const url = new URL(await authorizationUrl('youtube', 'state', 'verifier'));
    expect(url.searchParams.get('scope')).toContain('youtube.force-ssl');
  });
  it('keeps zero counts and converts observed watch minutes to seconds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (raw: string) => {
        if (raw.includes('youtubeanalytics'))
          return Response.json({
            columnHeaders: [
              { name: 'estimatedMinutesWatched' },
              { name: 'averageViewPercentage' },
              { name: 'shares' },
            ],
            rows: [[2.5, 42, 0]],
          });
        if (raw.includes('commentThreads')) return Response.json({ items: [] });
        return Response.json({ items: [{ statistics: { viewCount: '0' } }] });
      }),
    );
    const r = await metrics(conn, 'fixture', 'video', '2026-09-01T00:00:00Z');
    expect(r.metrics.views).toBe(0);
    expect(r.metrics.likes).toBeNull();
    expect(r.metrics.watchTime).toBe(150);
    expect(r.metrics.shares).toBe(0);
    expect(r.metrics.averageWatchPercentage).toBe(42);
  });
  it('leaves unavailable analytics null and propagates retryable rate limits', async () => {
    const fetcher = vi.fn(async (raw: string) =>
      raw.includes('youtubeanalytics')
        ? new Response('forbidden', { status: 403 })
        : Response.json({ items: [] }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await metrics(conn, 'fixture', 'video', '2026-09-01')).metrics.watchTime,
    ).toBeNull();
    fetcher.mockImplementation(async (raw: string) =>
      raw.includes('youtubeanalytics')
        ? new Response('quota', { status: 429 })
        : Response.json({ items: [] }),
    );
    await expect(
      metrics(conn, 'fixture', 'video', '2026-09-01'),
    ).rejects.toMatchObject({ providerStatus: 429 });
  });
});
