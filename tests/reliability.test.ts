import { describe, it, expect } from 'vitest';
import { boundedBytes } from '../lib/server/http';
import { postingWindows } from '../lib/timing';
import type {
  Entity,
  MetricObservation,
  ScheduledPost,
} from '../lib/contracts';
describe('bounded external data', () => {
  it('rejects a streaming response beyond its size limit', async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(5));
        c.enqueue(new Uint8Array(6));
        c.close();
      },
    });
    await expect(boundedBytes(new Response(stream), 10)).rejects.toThrow(
      'size',
    );
  });
  it('preserves exactly the allowed bytes', async () =>
    expect(await boundedBytes(new Response('1234567890'), 10)).toHaveLength(
      10,
    ));
});
describe('posting window evidence', () => {
  it('labels missing history experimental', () =>
    expect(postingWindows([], [], 'a', 'Asia/Kolkata').experimental).toBe(
      true,
    ));
  it('uses comparable observations from the selected account', () => {
    const posts: Entity<ScheduledPost>[] = [];
    const observations: Entity<MetricObservation>[] = [];
    for (let i = 0; i < 14; i++) {
      const at = `2026-01-${String(i + 1).padStart(2, '0')}T${i % 2 ? '15' : '09'}:00:00Z`;
      posts.push({
        id: String(i),
        workspace_id: 'w',
        brand_id: 'b',
        kind: 'schedule',
        created_at: at,
        updated_at: at,
        payload: {
          contentId: 'c',
          approvalId: 'a',
          accountId: 'selected',
          platform: 'x',
          scheduledAt: at,
          publishedAt: at,
          timezone: 'UTC',
          status: 'published',
          revision: 1,
        } as ScheduledPost,
      });
      observations.push({
        id: 'm' + i,
        workspace_id: 'w',
        brand_id: 'b',
        kind: 'metrics',
        created_at: at,
        updated_at: at,
        payload: {
          postId: String(i),
          platform: 'x',
          observedAt: new Date(Date.parse(at) + 86400000).toISOString(),
          metrics: { impressions: i % 2 ? 200 : 100 },
          definitions: {},
        },
      });
    }
    expect(
      postingWindows(posts, observations, 'selected', 'UTC'),
    ).toMatchObject({ experimental: false, hours: [15, 9], sampleCount: 14 });
    expect(
      postingWindows(posts, observations, 'another-account', 'UTC')
        .experimental,
    ).toBe(true);
  });
});
