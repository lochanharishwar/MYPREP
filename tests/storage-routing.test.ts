import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storageBuckets } from '../lib/server/storage';
import { assetUrl, storeAsset } from '../lib/server/db';
import { upload, type Connection } from '../lib/server/social';
import type { ContentVersion, Entity } from '../lib/contracts';

beforeEach(() => {
  vi.stubEnv('SUPABASE_DB_SCHEMA', 'public');
  vi.stubEnv('SUPABASE_MEDIA_BUCKET', '');
  vi.stubEnv('SUPABASE_PUBLISHED_MEDIA_BUCKET', '');
  vi.stubEnv('SUPABASE_URL', 'https://storage-fixture.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function isolatedBuckets() {
  vi.stubEnv('SUPABASE_DB_SCHEMA', 'brandcurrent');
  vi.stubEnv('SUPABASE_MEDIA_BUCKET', 'brandcurrent-media');
  vi.stubEnv('SUPABASE_PUBLISHED_MEDIA_BUCKET', 'brandcurrent-published-media');
}
describe('storage bucket routing', () => {
  it('preserves generic buckets for the existing public-schema deployment', () => {
    expect(storageBuckets()).toEqual({
      media: 'media',
      published: 'published-media',
    });
  });

  it('refuses an incomplete custom-schema setup or shared private/public bucket', () => {
    vi.stubEnv('SUPABASE_DB_SCHEMA', 'brandcurrent');
    expect(storageBuckets).toThrow('SUPABASE_MEDIA_BUCKET must be configured');
    vi.stubEnv('SUPABASE_MEDIA_BUCKET', 'brandcurrent-media');
    expect(storageBuckets).toThrow(
      'SUPABASE_PUBLISHED_MEDIA_BUCKET must be configured',
    );
    vi.stubEnv('SUPABASE_PUBLISHED_MEDIA_BUCKET', 'brandcurrent-media');
    expect(storageBuckets).toThrow('separate storage buckets');
  });

  it.each([
    '../media',
    'media/other',
    'media?token=bad',
    'media#bad',
    'with space',
  ])('rejects a bucket that could change URL routing: %s', (name) => {
    vi.stubEnv('SUPABASE_MEDIA_BUCKET', name);
    expect(storageBuckets).toThrow('valid storage bucket identifier');
  });

  it('blocks storage requests when custom-schema buckets are incomplete', async () => {
    vi.stubEnv('SUPABASE_DB_SCHEMA', 'brandcurrent');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      storeAsset('workspace', 'brand', new Uint8Array([1]), 'image/png'),
    ).rejects.toThrow('SUPABASE_MEDIA_BUCKET must be configured');
    await expect(assetUrl('workspace/brand/existing.png')).rejects.toThrow(
      'SUPABASE_MEDIA_BUCKET must be configured',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uploads and signs only inside the selected private bucket while preserving object paths', async () => {
    isolatedBuckets();
    const requests: { url: string; method: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (raw: string, init: RequestInit) => {
        const url = new URL(raw);
        requests.push({ url: url.pathname, method: init.method ?? 'GET' });
        return Response.json(
          url.pathname.includes('/object/sign/')
            ? {
                signedURL:
                  '/object/sign/brandcurrent-media/workspace/brand/existing.png?token=fixture',
              }
            : { Key: 'uploaded' },
        );
      }),
    );
    const stored = await storeAsset(
      'workspace',
      'brand',
      new Uint8Array([1, 2]),
      'image/jpeg',
    );
    expect(stored).toMatch(/^workspace\/brand\/[\w-]+\.jpg$/);
    const signed = await assetUrl('workspace/brand/existing.png');
    expect(signed).toContain(
      '/object/sign/brandcurrent-media/workspace/brand/existing.png',
    );
    expect(requests).toEqual([
      {
        url: `/storage/v1/object/brandcurrent-media/${stored}`,
        method: 'POST',
      },
      {
        url: '/storage/v1/object/sign/brandcurrent-media/workspace/brand/existing.png',
        method: 'POST',
      },
    ]);
  });

  it('uses the configured public bucket for Reddit staging and its returned URL', async () => {
    isolatedBuckets();
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (raw: string, init?: RequestInit) => {
        const url = new URL(raw);
        requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
        if (url.pathname.includes('/object/sign/') && init?.method === 'POST')
          return Response.json({
            signedURL:
              '/object/sign/brandcurrent-media/workspace/brand/existing.png?token=fixture',
          });
        if (!init?.method) return new Response(new Uint8Array([1, 2, 3]));
        return Response.json({ Key: 'uploaded' });
      }),
    );
    const connection: Entity<Connection> = {
      id: 'connection',
      workspace_id: 'workspace',
      brand_id: 'brand',
      kind: 'connection',
      payload: {
        platform: 'reddit',
        accountId: 'account',
        name: 'Fixture',
        status: 'connected',
      },
      created_at: '2026-10-21',
      updated_at: '2026-10-21',
    };
    const content: ContentVersion = {
      campaignId: 'campaign',
      dnaId: 'dna',
      format: 'image',
      platform: 'reddit',
      caption: 'Fixture content',
      assetPath: 'workspace/brand/existing.png',
      mimeType: 'image/png',
      review: {
        brandAlignment: 9,
        psychology: 9,
        visualQuality: 9,
        platformFit: 9,
        feedback: [],
        score: 9,
        passed: true,
        attempt: 1,
      },
      status: 'approved',
      contentHash: 'fixture-hash',
      attempt: 1,
    };
    const result = await upload(connection, content, 'fixture-token');
    const publicPath = result.publicPath;
    if (typeof publicPath !== 'string')
      throw new Error('Missing staged public path');
    expect(result.url).toBe(
      `https://storage-fixture.supabase.co/storage/v1/object/public/brandcurrent-published-media/${publicPath}`,
    );
    expect(requests[2]).toBe(
      `POST /storage/v1/object/brandcurrent-published-media/${publicPath}`,
    );
    expect(
      requests.some((path) => path.includes('/object/published-media/')),
    ).toBe(false);
  });
});
