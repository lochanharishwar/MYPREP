import { describe, it, expect } from 'vitest';
import { postingSuggestions, postingWindows } from '../lib/timing';
import { socialSetup } from '../lib/social-catalog';
import { assertOAuthBrowser, oauthCookie } from '../lib/server/oauth-browser';
import type {
  Entity,
  MetricObservation,
  Platform,
  ScheduledPost,
} from '../lib/contracts';

function history(platform: Platform = 'x') {
  const posts: Entity<ScheduledPost>[] = [],
    observations: Entity<MetricObservation>[] = [];
  for (let i = 0; i < 18; i++) {
    const at = new Date(Date.UTC(2026, 8, 1 + i, i % 2 ? 18 : 9)).toISOString();
    const value = i === 0 ? 100000 : i % 2 ? 200 : 100;
    const post = {
      id: `${i}`,
      workspace_id: 'w',
      brand_id: 'b',
      kind: 'schedule',
      created_at: at,
      updated_at: at,
      payload: {
        contentId: 'c',
        approvalId: 'a',
        accountId: 'selected',
        platform,
        scheduledAt: at,
        publishedAt: at,
        timezone: 'UTC',
        status: 'published',
        revision: 1,
      },
    } as Entity<ScheduledPost>;
    posts.push(post);
    observations.push({
      ...post,
      id: `m${i}`,
      kind: 'metrics',
      payload: {
        platform,
        postId: post.id,
        observedAt: new Date(Date.parse(at) + 86400000).toISOString(),
        metrics: { impressions: value, views: value },
        definitions: {},
      },
    });
  }
  return { posts, observations };
}
const now = Date.parse('2026-09-25T15:00:00Z');
describe('actionable posting suggestions', () => {
  it('uses medians so one viral outlier does not become the best hour', () => {
    const { posts, observations } = history();
    expect(
      postingWindows(posts, observations, 'selected', 'UTC', { now }),
    ).toMatchObject({
      experimental: false,
      hours: [18, 9],
      metric: 'impressions',
    });
  });
  it('uses views for YouTube, without inventing impressions', () => {
    const { posts, observations } = history('youtube');
    observations.forEach((o) => {
      o.payload.metrics.impressions = null;
    });
    expect(
      postingWindows(posts, observations, 'selected', 'UTC', { now }).metric,
    ).toBe('views');
    expect(
      postingWindows(posts, observations, 'selected', 'UTC', { now })
        .experimental,
    ).toBe(false);
  });
  it('does not rank zero-only data, wrong brands or another account', () => {
    const { posts, observations } = history();
    expect(
      postingWindows(posts, observations, 'other', 'UTC', { now }).sampleCount,
    ).toBe(0);
    const foreign = observations.map((o) => ({ ...o, brand_id: 'foreign' }));
    expect(
      postingWindows(posts, foreign, 'selected', 'UTC', { now }).sampleCount,
    ).toBe(0);
    observations.forEach((o) => {
      o.payload.metrics.impressions = 0;
    });
    expect(
      postingWindows(posts, observations, 'selected', 'UTC', { now })
        .experimental,
    ).toBe(true);
  });
  it('deduplicates posts and ignores future and outdated observations', () => {
    const { posts, observations } = history();
    expect(
      postingWindows([...posts, ...posts], observations, 'selected', 'UTC', {
        now,
      }).sampleCount,
    ).toBe(18);
    observations.forEach((o) => {
      o.payload.observedAt = '2026-10-30T00:00:00Z';
    });
    expect(
      postingWindows(posts, observations, 'selected', 'UTC', { now })
        .sampleCount,
    ).toBe(0);
    const h = history();
    expect(
      postingSuggestions(
        h.posts,
        h.observations,
        'selected',
        'UTC',
        Date.parse('2027-02-01T00:00:00Z'),
      ).every((d) => d.experimental),
    ).toBe(true);
  });
  it('makes future, timezone-correct selections across DST and local midnight', () => {
    const india = postingSuggestions(
      [],
      [],
      '',
      'Asia/Kolkata',
      Date.parse('2026-10-10T20:00:00Z'),
    );
    expect(india[0].date).toBe('2026-10-11');
    expect(india[0].slots[0].utc).toBe('2026-10-11T03:30:00.000Z');
    const dst = postingSuggestions(
      [],
      [],
      '',
      'America/New_York',
      Date.parse('2026-10-31T23:00:00Z'),
    );
    expect(dst[1].slots[0].utc).toBe('2026-11-01T14:00:00.000Z');
    expect(
      dst
        .flatMap((d) => d.slots)
        .every((s) => Date.parse(s.utc) > Date.parse('2026-10-31T23:00:00Z')),
    ).toBe(true);
  });
  it('uses same-weekday evidence only when competing hours have multiple dates', () => {
    const { posts, observations } = history();
    posts.forEach((p, i) => {
      const at = new Date(
        Date.UTC(2026, 5, 1 + Math.floor(i / 2) * 7, i % 2 ? 18 : 9),
      ).toISOString();
      Object.assign(p.payload, { publishedAt: at });
      observations[i].payload.observedAt = new Date(
        Date.parse(at) + 86400000,
      ).toISOString();
    });
    expect(
      postingWindows(posts, observations, 'selected', 'UTC', {
        now,
        date: '2026-09-28',
      }).basis,
    ).toBe('weekday');
    expect(
      postingWindows(posts, observations, 'selected', 'UTC', {
        now,
        date: '2026-09-29',
      }).basis,
    ).toBe('account');
  });
});
describe('social authorization readiness and browser binding', () => {
  it('does not equate an OAuth app with a usable account connection', () => {
    expect(
      socialSetup('youtube', [{ name: 'Youtube', ready: true }], true)
        .connectReady,
    ).toBe(false);
    const services = [
      'Youtube',
      'Server workspace',
      'Social token protection',
    ].map((name) => ({ name, ready: true }));
    expect(socialSetup('youtube', services, false)).toMatchObject({
      connectReady: true,
      backgroundReady: false,
    });
  });
  it('accepts only the initiating browser and clears a scoped secure cookie', () => {
    const req = new Request('https://brand.test/api/oauth/x/callback', {
      headers: { cookie: 'other=1; bc_oauth_x=state' },
    });
    expect(() => assertOAuthBrowser(req, 'x', 'state')).not.toThrow();
    expect(() => assertOAuthBrowser(req, 'x', 'attacker')).toThrow('browser');
    expect(() => assertOAuthBrowser(req, 'youtube', 'state')).toThrow(
      'browser',
    );
    expect(oauthCookie('x', 'state', true)).toContain(
      'HttpOnly; SameSite=Lax; Secure',
    );
    expect(oauthCookie('x', '', true, true)).toContain('Max-Age=0');
  });
});
