import { afterEach, describe, it, expect, vi } from 'vitest';
import { POST as scanPost } from '@/app/api/local/scan/route';
import { POST as generatePost } from '@/app/api/local/generate/route';
import { parsePage, observedStyles } from '@/lib/server/local-crawl';
import { publicFetch } from '@/lib/server/public-fetch';
import { GET as configuration } from '@/app/api/config/route';
import type { crawlWebsite } from '@/lib/server/local-crawl';
import type { ReviewResult } from '@/lib/contracts';
type Generated = {
  image: { mimeType: string; data: string };
  caption: string;
  review: ReviewResult;
};
type GeminiBody = {
  generationConfig: {
    responseModalities?: string[];
    responseMimeType?: string;
  };
  contents: {
    parts: { text?: string; inlineData?: { data: string; mimeType: string } }[];
  }[];
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const request = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`http://localhost/api/local/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const dns = (raw: string) =>
  raw.includes('type=AAAA')
    ? Response.json({ Status: 0, Answer: [] })
    : Response.json({
        Status: 0,
        Answer: [{ type: 1, data: '93.184.216.34' }],
      });
const brief = {
  idea: 'Show our bicycle on the daily commute',
  formats: ['image'],
  platforms: ['instagram'],
  budget: 10,
  audience: 'Commuters',
  scenario: 'Morning city ride',
  event: 'Launch',
  direction: 'Natural daylight',
  brand: {
    name: 'Cycle',
    tagline: null,
    overview: [{ text: 'Bicycles for commuting' }],
    palette: [],
  },
};
const answer = (parts: unknown[]) =>
  Response.json({ candidates: [{ content: { parts } }] });
describe('Actual website observations', () => {
  it('opens locally without login even when Supabase is configured', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SUPABASE_URL', 'https://project.example');
    vi.stubEnv('SUPABASE_ANON_KEY', 'fixture');
    expect(
      ((await (await configuration()).json()) as { workspaceMode: string })
        .workspaceMode,
    ).toBe('browser');
  });
  it('keeps exact observed assets and CSS declarations and leaves missing facts empty', () => {
    const p = parsePage(
      '<title>Cycle store</title><meta property="og:site_name" content="Cycle"><p class="tagline">Ride your way.</p><img alt="Cycle logo" src="/logo.svg"><a rel="noopener" href="/products">Products</a>',
      'https://example.com/',
    );
    expect(p.tagline).toBe('Ride your way.');
    expect(p.logo).toBe('https://example.com/logo.svg');
    expect(p.links).toContain('https://example.com/products');
    expect(
      parsePage('<h1>An ordinary heading</h1>', 'https://example.com').tagline,
    ).toBeNull();
    const styles = observedStyles(
      'body {color:#AABBCC;font-family:Inter} .card{background:rgb(1, 2, 3)}',
      'https://example.com/style.css',
    );
    expect(styles.colors).toHaveLength(2);
    expect(styles.colors[0]).toMatchObject({
      value: '#aabbcc',
      url: 'https://example.com/style.css',
      method: 'CSS declaration (not computed)',
    });
    expect(styles.fonts).toContain('Inter');
    const inline = parsePage(
      '<p style="color:#123">Text</p><div style="background:#456">Card</div>',
      'https://example.com',
    );
    expect(
      observedStyles(inline.css, inline.url).colors.map((c) => c.selector),
    ).toEqual(['p[style] · color', 'div[style] · background']);
  });
  it('reads fixture pages with bounded coverage and inaccessible CSS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (raw: string) => {
        if (raw.includes('dns-query')) return dns(raw);
        if (raw.endsWith('.css'))
          return new Response('blocked', { status: 403 });
        if (raw.endsWith('sitemap.xml'))
          return new Response('missing', { status: 404 });
        const links = Array.from(
          { length: 7 },
          (_, i) => `<a href="/page${i}">Page ${i}</a>`,
        ).join('');
        return new Response(
          `<title>Fixture site</title><meta property="og:site_name" content="Fixture"><meta name="description" content="Observed description"><link rel="stylesheet" href="/style.css">${links}`,
          { headers: { 'content-type': 'text/html' } },
        );
      }),
    );
    const r = await scanPost(request('scan', { url: 'https://example.com' }));
    expect(r.status).toBe(200);
    const data = (await r.json()) as Awaited<ReturnType<typeof crawlWebsite>>;
    expect(data.scan.status).toBe('partial');
    expect(data.scan.completed).toHaveLength(6);
    expect(data.scan.queue.length).toBeGreaterThan(0);
    expect(data.scan.warnings.join(' ')).toContain('Stylesheet');
    expect(data.scan.error).toBeNull();
    expect(data.dna.colors).toEqual([]);
    expect(data.dna.tagline).toBeNull();
    expect(data.dna.values).toEqual([]);
    expect(data.pages).toHaveLength(6);
  });
  it('never synthesizes brand information when DNS is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('DNS unavailable')),
    );
    const response = await scanPost(
      request('scan', { url: 'https://offline.example' }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    const result = (await response.json()) as { dna?: unknown; error: string };
    expect(result.dna).toBeUndefined();
    expect(result.error).toContain('DNS');
  });
  it('rejects a redirect to a private address before fetching it', async () => {
    const fetcher = vi.fn(async (raw: string) => {
      if (raw.includes('name=private.example'))
        return Response.json({
          Status: 0,
          Answer: [{ type: 1, data: '127.0.0.1' }],
        });
      if (raw.includes('dns-query')) return dns(raw);
      return new Response(null, {
        status: 302,
        headers: { location: 'https://private.example/admin' },
      });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(publicFetch('https://example.com')).rejects.toThrow('Private');
    expect(
      fetcher.mock.calls.some(
        ([url]) => url === 'https://private.example/admin',
      ),
    ).toBe(false);
  });
  it('rejects cross-site calls and malformed JSON before using a provider', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(
      (
        await scanPost(
          request(
            'scan',
            { url: 'https://example.com' },
            { origin: 'https://attacker.example' },
          ),
        )
      ).status,
    ).toBe(403);
    const invalid = new Request('http://localhost/api/local/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect((await scanPost(invalid)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe('Real image generation contract (mocked provider transport)', () => {
  it('does not generate or approve anything without a key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const r = await generatePost(request('generate', brief));
    expect(r.status).toBe(503);
    const body = (await r.json()) as Partial<Generated>;
    expect(body.image).toBeUndefined();
    expect(body.review).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('passes the product reference to the image model and grades the finished output', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'fixture-test-key');
    const image = { mimeType: 'image/png', data: 'ZmluaXNoZWQ=' };
    const requests: { url: string; body: GeminiBody }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (raw: string, options: RequestInit) => {
        if (raw.includes('dns-query')) return dns(raw);
        if (raw === 'https://example.com/product.png')
          return new Response('reference', {
            headers: { 'content-type': 'image/png' },
          });
        if (typeof options.body !== 'string')
          throw new Error('Expected JSON request');
        if (raw.endsWith(':countTokens'))
          return Response.json({ totalTokens: 1200 });
        const body = JSON.parse(options.body) as GeminiBody;
        requests.push({ url: raw, body });
        if (body.generationConfig.responseModalities)
          return answer([
            {
              inlineData: { mimeType: 'image/png', data: 'dGhvdWdodA==' },
              thought: true,
            },
            { inlineData: image },
          ]);
        if (body.generationConfig.responseMimeType)
          return answer([
            {
              text: JSON.stringify({
                brandAlignment: 8.6,
                psychology: 8.6,
                visualQuality: 8.6,
                platformFit: 8.6,
                feedback: ['Show the product more clearly.'],
              }),
            },
          ]);
        return answer([{ text: 'A bicycle for your daily commute.' }]);
      }),
    );
    const r = await generatePost(
      request('generate', {
        ...brief,
        referenceUrl: 'https://example.com/product.png',
        brand: {
          ...brief.brand,
          voice: [
            {
              text: 'Calm practical language',
              type: 'interpretation',
              evidenceIds: ['voice-source'],
            },
          ],
          aesthetics: [
            {
              text: 'Restrained teal details',
              type: 'interpretation',
              evidenceIds: ['voice-source'],
            },
          ],
          fonts: ['Inter'],
          evidence: [
            {
              id: 'voice-source',
              url: 'https://example.com/about',
              excerpt: 'Designed for everyday commuting.',
              observedAt: '2026-10-09T00:00:00Z',
              method: 'dom',
              confidence: 0.9,
            },
          ],
          governance: {
            toneRules: 'Avoid hype',
            forbiddenClaims: ['Guaranteed results'],
          },
        },
      }),
    );
    expect(r.status).toBe(200);
    const result = (await r.json()) as Generated;
    expect(result.image).toEqual(image);
    expect(result.review.passed).toBe(false);
    expect(result.review.score).toBeCloseTo(8.6);
    expect(requests[1].url).toContain('gemini-3-pro-image:generateContent');
    expect(requests[1].body.contents[0].parts[1].inlineData?.data).toBe(
      Buffer.from('reference').toString('base64'),
    );
    expect(requests[1].body.contents[0].parts[0].text).toContain(
      'Natural daylight',
    );
    expect(requests[2].body.contents[0].parts[1].inlineData).toEqual(image);
    expect(requests[2].body.contents[0].parts[0].text).toContain('Design review visual-design-1');
    expect(requests[1].body.contents[0].parts[0].text).toContain('only when no alternative visual style is requested');
    expect(requests[2].body.contents[0].parts[0].text).toContain(
      'A bicycle for your daily commute.',
    );
    for (const sent of requests) {
      const prompt = sent.body.contents[0].parts[0].text;
      expect(prompt).toContain('Calm practical language');
      expect(prompt).toContain('Restrained teal details');
      expect(prompt).toContain('voice-source');
      expect(prompt).toContain('Avoid hype');
      expect(prompt).toContain('Guaranteed results');
      expect(prompt).toContain('not independently verified');
    }
  });
  it('surfaces provider quota failure without a fallback image', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'fixture-test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('quota', { status: 429 })),
    );
    const r = await generatePost(request('generate', brief));
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: string }).error).toContain('quota');
  });
  it('does not expose hosted paid generation through browser-only budget checks', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BROWSER_WORKSPACE_MODE', 'sites');
    vi.stubEnv('GEMINI_API_KEY', 'fixture-test-key');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const r = await generatePost(
      request('generate', brief, {
        'oai-authenticated-user-id': 'fixture-user',
      }),
    );
    expect(r.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
