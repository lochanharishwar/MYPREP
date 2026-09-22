import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parsePage,
  crawlWebsite,
  readTextPrefix,
  observedStyles,
} from '@/lib/server/local-crawl';
import { assertLocalRequest } from '@/lib/server/local-request';
import { scanWithProgress } from '@/lib/scan-stream';
import { POST } from '@/app/api/local/scan/route';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const html = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/html' } });
const dns = (url: string) =>
  Response.json({
    Status: 0,
    Answer: url.includes('type=AAAA')
      ? []
      : [{ type: 1, data: '93.184.216.34' }],
  });
describe('Accurate website observations and scan recovery', () => {
  it('does not promote animated word fragments or demo fonts to brand identity', () => {
    const page = parsePage(
      '<p>Build better <span class="lw-tagline-type">interactions</span></p>',
      'https://example.com',
    );
    expect(page.tagline).toBeNull();
    const styles = observedStyles(
      '.demo{font-family:Fake} body{font-family:Inter;color:oklch(var(--brand))} :root{--primary:oklch(0.6 0.1 200)}',
      'https://example.com',
    );
    expect(styles.fonts).toEqual(['Inter']);
    expect(styles.colors.map((c) => c.value)).toEqual(['oklch(0.6 0.1 200)']);
  });
  it('does not extract brand identity, links or CSS from script/code examples', () => {
    const page = parsePage(
      `<html><head><meta property="og:site_name" content="Actual brand"><script>const demo='<p class="tagline">Fake slogan</p><img alt="logo" src="/fake.png"><a href="/fake">Demo</a>';</script></head><body><header><img alt="Actual logo" src="/real.svg"></header><main><pre><p class="tagline">Example slogan</p></pre><p class="hero-tagline">Made <strong>for you</strong>.</p></main></body></html>`,
      'https://example.com',
    );
    expect(page.name).toBe('Actual brand');
    expect(page.tagline).toBe('Made for you.');
    expect(page.logo).toBe('https://example.com/real.svg');
    expect(page.links).not.toContain('https://example.com/fake');
    expect(page.text).not.toContain('Fake slogan');
  });
  it('extracts first-party organization data without mistaking a product or partner for the company', () => {
    const page = parsePage(
      `<html><head><script type="application/ld+json">{"@graph":[{"@type":"Product","name":"A shoe"},{"@type":"Organization","name":"Partner","url":"https://partner.example"},{"@type":"Organization","url":"https://example.com","name":"Actual","slogan":"Made for everyday.","logo":{"@type":"ImageObject","url":"/brand.svg"}}]}</script></head><body><main><p>Products designed for your everyday adventures.</p></main></body></html>`,
      'https://example.com',
    );
    expect(page.name).toBe('Actual');
    expect(page.logo).toBe('https://example.com/brand.svg');
    expect(page.tagline).toBe('Made for everyday.');
    expect(page.identity.name).toContain('Organization.name');
  });
  it('keeps bounded text from a large response instead of discarding it', async () => {
    const response = new Response('a'.repeat(300), {
      headers: { 'content-length': '300' },
    });
    expect(await readTextPrefix(response, 100)).toEqual({
      text: 'a'.repeat(100),
      truncated: true,
    });
  });
  it('uses observed body copy without inventing a slogan or brand traits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('dns-query')
          ? dns(url)
          : url.endsWith('.xml')
            ? new Response('', { status: 404 })
            : html(
                '<html><head><title>Website</title></head><body><main><h1>Our bicycles</h1><p>We build bicycles designed for everyday journeys through the city.</p></main></body></html>',
              ),
      ),
    );
    const result = await crawlWebsite('example.com');
    expect(result.dna.overview[0].text).toContain('We build bicycles');
    expect(
      result.dna.evidence.some(
        (e) => e.id === result.dna.overview[0].evidenceIds[0],
      ),
    ).toBe(true);
    expect(result.dna.name).toBeNull();
    expect(result.dna.tagline).toBeNull();
    expect(result.dna.values).toEqual([]);
    expect(result.scan.error).toBeNull();
  });
  it('recovers a sitemap-index page when the homepage and reader fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('dns-query')) return dns(url);
        if (url.endsWith('/sitemap.xml'))
          return new Response(
            '<sitemapindex><sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>',
          );
        if (url.endsWith('/pages.xml'))
          return new Response(
            '<urlset><url><loc>https://example.com/about</loc></url></urlset>',
          );
        if (url.endsWith('/about'))
          return html(
            '<html><head><meta name="description" content="Our actual company story."></head><body><h1>About us</h1></body></html>',
          );
        return new Response('', { status: 403 });
      }),
    );
    const result = await crawlWebsite('https://example.com');
    expect(result.scan.failed).toContain('https://example.com');
    expect(result.scan.completed).toContain('https://example.com/about');
    expect(result.dna.overview[0].text).toBe('Our actual company story.');
    expect(result.scan.error).toBeNull();
  });
  it('accepts actual Sites email-only identity but rejects anonymous and cross-site calls', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BROWSER_WORKSPACE_MODE', 'sites');
    vi.stubEnv('APP_ORIGIN', 'https://brand.example');
    const req = (headers: Record<string, string>) =>
      new Request('https://internal.worker/api/local/scan', {
        headers: { 'content-type': 'application/json', ...headers },
      });
    expect(() =>
      assertLocalRequest(
        req({
          origin: 'https://brand.example',
          'oai-authenticated-user-email': 'owner@example.com',
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertLocalRequest(req({ origin: 'https://brand.example' })),
    ).toThrow('private Sites');
    expect(() =>
      assertLocalRequest(
        req({
          origin: 'https://evil.example',
          'oai-authenticated-user-email': 'owner@example.com',
        }),
      ),
    ).toThrow('Cross-site');
  });
  it('allows dispatcher-authorized public scans without opening paid operations or other origins', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BROWSER_WORKSPACE_MODE', 'sites');
    vi.stubEnv('APP_ORIGIN', 'https://brand.example');
    const headers = {
      'content-type': 'application/json',
      'x-dispatched-app': 'site---aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      origin: 'https://brand.example',
    };
    const scan = new Request('https://brand.example/api/local/scan', {
      headers,
    });
    expect(() => assertLocalRequest(scan, true)).not.toThrow();
    expect(() => assertLocalRequest(scan)).toThrow('private Sites');
    expect(() =>
      assertLocalRequest(
        new Request('https://other.example/api/local/scan', { headers }),
        true,
      ),
    ).toThrow('private Sites');
    expect(() =>
      assertLocalRequest(
        new Request('https://brand.example/api/local/scan', {
          headers: { ...headers, origin: 'https://evil.example' },
        }),
        true,
      ),
    ).toThrow('Cross-site');
  });
  it('streams source-backed findings before completing the scan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('dns-query')
          ? dns(url)
          : url.endsWith('.xml')
            ? new Response('', { status: 404 })
            : html(
                '<html><head><meta name="description" content="A real observed description"></head><body></body></html>',
              ),
      ),
    );
    const result = await POST(
      new Request('http://localhost/api/local/scan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/x-ndjson',
        },
        body: '{"url":"https://example.com"}',
      }),
    );
    const events = (await result.text())
      .trim()
      .split('\n')
      .map((s) => JSON.parse(s));
    expect(events.map((e) => e.type)).toEqual(['progress', 'complete']);
    expect(events[0].result.dna.overview[0].text).toBe(
      'A real observed description',
    );
  });
  it('keeps delivered progress when a stream stops before completion', async () => {
    const result = {
      scan: { status: 'partial' },
      dna: { coverage: { completed: 1 } },
      pages: [],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ type: 'progress', result }) + '\n', {
            headers: { 'content-type': 'application/x-ndjson' },
          }),
      ),
    );
    const saved = vi.fn();
    await expect(
      scanWithProgress('https://example.com', saved),
    ).rejects.toThrow('already read have been saved');
    expect(saved).toHaveBeenCalledWith(result, false);
  });
});
