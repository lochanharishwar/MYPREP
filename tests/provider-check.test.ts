import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/local/provider-check/route';
import type { ProviderConnectionCheck } from '@/lib/local-generation';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GEMINI_API_KEY', 'private-fixture-key');
  vi.stubEnv('GEMINI_TEXT_MODEL', 'gemini-3.1-pro-preview');
  vi.stubEnv('GEMINI_REVIEW_MODEL', 'gemini-3.1-pro-preview');
  vi.stubEnv('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image');
}
const request = (
  body = {},
  headers = {},
  url = 'http://localhost:3000/api/local/provider-check',
) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('local provider diagnostics without paid generation', () => {
  it('checks each distinct configured model using only countTokens and a fixed prompt', async () => {
    setup();
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ totalTokens: 4 }),
    );
    vi.stubGlobal('fetch', fetcher);
    const response = await POST(request());
    const result = (await response.json()) as ProviderConnectionCheck;
    expect(result).toMatchObject({ ok: true, generationTested: false });
    expect(result.checks).toHaveLength(2);
    expect(result.checks[0].uses).toEqual(['Captions', 'Review']);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toMatch(
        /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-[\w.-]+:countTokens$/,
      );
      expect(typeof init.body).toBe('string');
      const body = JSON.parse(init.body as string);
      expect(body.generateContentRequest.contents).toEqual([
        { role: 'user', parts: [{ text: 'Connection check.' }] },
      ]);
      expect(body.generateContentRequest.generationConfig).toBeUndefined();
    }
    expect(JSON.stringify(result)).not.toContain('private-fixture-key');
  });

  it('reports partial provider access without echoing provider messages or credentials', async () => {
    setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('pro-image')
          ? Response.json(
              { error: { message: 'private-fixture-key is rejected' } },
              { status: 404 },
            )
          : Response.json({ totalTokens: 4 }),
      ),
    );
    const response = await POST(request());
    const result = (await response.json()) as ProviderConnectionCheck;
    expect(result.ok).toBe(false);
    expect(result.checks[0].ok).toBe(true);
    expect(result.checks[1]).toMatchObject({ ok: false });
    expect(result.checks[1].message).toContain('unavailable for this account');
    expect(JSON.stringify(result)).not.toContain('private-fixture-key');
  });

  it.each([
    {
      body: { prompt: 'Do not accept user-supplied probe data' },
      headers: {},
      url: 'http://localhost:3000/api/local/provider-check',
      status: 400,
    },
    {
      body: {},
      headers: { origin: 'https://untrusted.example' },
      url: 'http://localhost:3000/api/local/provider-check',
      status: 403,
    },
    {
      body: {},
      headers: {},
      url: 'https://untrusted.example/api/local/provider-check',
      status: 403,
    },
  ])(
    'rejects invalid probe requests before contacting Google ($status)',
    async ({ body, headers, url, status }) => {
      setup();
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      expect((await POST(request(body, headers, url))).status).toBe(status);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('never runs the diagnostic on production', async () => {
    setup();
    vi.stubEnv('NODE_ENV', 'production');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect((await POST(request())).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
