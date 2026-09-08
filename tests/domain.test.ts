import { describe, it, expect } from 'vitest';
import {
  reviewScore,
  contentHash,
  normalizeUrl,
  utcFromLocal,
  parseCSV,
  safeRatio,
  refreshDelay,
  assertRole,
} from '../lib/domain';
import { campaignSchema, eventSchema } from '../lib/contracts';
const scores = (n: number) => ({
  brandAlignment: n,
  psychology: n,
  visualQuality: n,
  platformFit: n,
  feedback: [],
});
describe('review gates', () => {
  it('accepts exactly 8.7 and rejects below before display rounding', () => {
    expect(reviewScore(scores(8.7)).passed).toBe(true);
    expect(reviewScore(scores(8.6999)).passed).toBe(false);
    expect(reviewScore(scores(8.71)).passed).toBe(true);
  });
  it('uses rubric weights rather than a model-supplied total', () =>
    expect(
      reviewScore({
        brandAlignment: 10,
        psychology: 8,
        visualQuality: 9,
        platformFit: 8,
        feedback: [],
      }).score,
    ).toBe(8.9));
  it('rejects 100-point and NaN scores', () => {
    expect(() => reviewScore(scores(87))).toThrow();
    expect(() => reviewScore(scores(NaN))).toThrow();
  });
  it('changes approval hashes when caption, media or platform changes', async () => {
    const c = {
      caption: 'Real product',
      assetPath: 'a.png',
      platform: 'x' as const,
      format: 'image' as const,
      dnaId: 'v1',
    };
    const h = await contentHash(c);
    expect(await contentHash({ ...c, caption: 'Different claim' })).not.toBe(h);
    expect(await contentHash({ ...c, assetPath: 'b.png' })).not.toBe(h);
    expect(await contentHash({ ...c, platform: 'linkedin' })).not.toBe(h);
  });
});
describe('scheduling', () => {
  it('converts Kolkata without treating local time as UTC', () =>
    expect(utcFromLocal('2026-09-07T09:00', 'Asia/Kolkata')).toBe(
      '2026-09-07T03:30:00.000Z',
    ));
  it('rejects DST gaps and overlaps', () => {
    expect(() => utcFromLocal('2026-03-08T02:30', 'America/New_York')).toThrow(
      'does not exist',
    );
    expect(() => utcFromLocal('2026-11-01T01:30', 'America/New_York')).toThrow(
      'twice',
    );
  });
  it('follows bounded refresh windows', () => {
    expect(refreshDelay(0)).toBe(900);
    expect(refreshDelay(86400000)).toBe(3600);
    expect(refreshDelay(7 * 86400000)).toBe(86400);
    expect(refreshDelay(30 * 86400000)).toBe(null);
  });
});
describe('evidence inputs', () => {
  it('normalizes tracking URLs and rejects unsafe origins', () => {
    expect(normalizeUrl('https://example.com/a?utm_source=x&b=2#x')).toBe(
      'https://example.com/a?b=2',
    );
    for (const u of [
      'file:///etc/passwd',
      'http://localhost/a',
      'http://127.0.0.1',
      'http://2130706433',
      'http://[::1]',
      'https://a:b@example.com',
    ])
      expect(() => normalizeUrl(u)).toThrow();
  });
  it('requires format selection', () =>
    expect(
      campaignSchema.safeParse({
        brandId: crypto.randomUUID(),
        idea: 'A real campaign',
        formats: [],
        platforms: ['x'],
        budget: 5,
      }).success,
    ).toBe(false));
  it('requires revenue provenance fields', () =>
    expect(
      eventSchema.safeParse({
        eventId: 'e',
        occurredAt: '2026-01-01T00:00:00Z',
        type: 'purchase',
        customerId: 'c',
      }).success,
    ).toBe(false));
  it('parses quoted CSV without losing newlines', () =>
    expect(parseCSV('id,text\n1,"hello,\nworld"')).toEqual([
      { id: '1', text: 'hello,\nworld' },
    ]));
  it('rejects malformed CSV', () => {
    expect(() => parseCSV('id,id\n1,2')).toThrow();
    expect(() => parseCSV('id,text\n1')).toThrow();
  });
  it('does not turn missing data into zero', () => {
    expect(safeRatio(null, 10)).toBe(null);
    expect(safeRatio(100, 0)).toBe(null);
    expect(safeRatio(0, 10)).toBe(0);
  });
  it('prevents an editor approving or a viewer mutating', () => {
    expect(() => assertRole('editor', ['owner', 'approver'])).toThrow();
    expect(() => assertRole('viewer', ['owner', 'editor'])).toThrow();
  });
});
