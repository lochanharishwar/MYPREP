import { describe, it, expect, vi, afterEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  db: vi.fn(),
  rpc: vi.fn(),
  entity: vi.fn(),
  assetUrl: vi.fn(),
}));
vi.mock('../lib/server/db', () => mocks);
vi.mock('../lib/server/env', () => ({ env: (_name: string, fallback = '') => fallback }));
import { GET as jobs } from '../app/api/jobs/route';
import { GET as media } from '../app/api/media/route';
import { GET as reports } from '../app/api/reports/route';
import { GET as exports } from '../app/api/export/route';
const id = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.restoreAllMocks());
describe('read route error boundaries (mocked database)', () => {
  it.each([jobs, media, reports, exports])(
    'redacts unexpected scope failures at the route boundary',
    async (handler) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mocks.scope.mockRejectedValue(new Error('secret database credential'));
      const response = await handler(
        new Request(`https://example.com/api/test?brandId=${id}&id=${id}`),
      );
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('secret database credential');
    },
  );
  it('classifies invalid reporting periods as client errors', async () => {
    mocks.scope.mockResolvedValue({});
    const response = await reports(
      new Request(
        `https://example.com/api/reports?brandId=${id}&start=2026-09-18&end=2026-09-17&type=metrics`,
      ),
    );
    expect(response.status).toBe(400);
  });
});

