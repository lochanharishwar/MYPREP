import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { apiFailure } from '../lib/server/api-error';

describe('safe API failure contract', () => {
  it.each([undefined, 200, 700, NaN, '401'])(
    'redacts unexpected failures and rejects invalid status %s',
    async (status) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const response = apiFailure(
          {
            status,
            message: 'secret-token SQL private-customer',
            details: 'private',
          },
          'jobs',
        );
        expect(response.status).toBe(500);
        const body = z
          .object({ code: z.string(), requestId: z.uuid() })
          .parse(await response.json());
        expect(JSON.stringify(body)).not.toMatch(
          /secret-token|SQL|private-customer/,
        );
        expect(body.code).toBe('UNAVAILABLE');
        expect(response.headers.get('x-request-id')).toBe(body.requestId);
        expect(response.headers.get('cache-control')).toBe('private,no-store');
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token');
      } finally {
        log.mockRestore();
      }
    },
  );
  it.each([400, 401, 403, 404, 409, 429])(
    'preserves HTTP %s without reflecting backend text',
    async (status) => {
      const response = apiFailure(
        Object.assign(new Error('private detail'), { status }),
        'media',
      );
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain('private detail');
    },
  );
  it('reports invalid input without serializing custom validation messages', async () => {
    const parsed = z
      .string()
      .refine(() => false, 'private validation text')
      .safeParse('secret');
    const response = apiFailure(parsed.error, 'reports');
    expect(response.status).toBe(400);
    expect(await response.text()).not.toMatch(/secret|private validation/);
  });
  it('preserves the state envelope while preventing base error override', async () => {
    const response = apiFailure(new SyntaxError('private'), 'state', {
      configured: true,
      authenticated: false,
      error: 'private',
    });
    expect(await response.json()).toMatchObject({
      configured: true,
      authenticated: false,
      code: 'INVALID_REQUEST',
    });
  });
});
