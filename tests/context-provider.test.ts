import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextDiscover, contextScrape, contextResearch, scrapingProvider } from '@/lib/server/context-client';
import { discover, scrape, research, htmlStyleFallback } from '@/lib/server/providers';
import { reserve } from '@/lib/server/billing';
import { serviceStatus } from '@/lib/server/service-status';

vi.mock('@/lib/server/billing', () => ({ reserve: vi.fn() }));
const ctx = { workspaceId: 'workspace', brandId: 'brand' };
const source = 'https://example.com/';
const page = '<html><head><title>Example tools</title><style>body{color:#123456;font-family:Inter}</style></head><body><header><img alt="Example logo" src="/logo.svg"></header><main><p class="hero-tagline">Tools for everyday work.</p><p>We build durable tools for craftspeople and gardeners.</p><a href="/about">About</a></main></body></html>';
function transport(value: unknown, status = 200) {
  const provider = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(value, { status }));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('dns-query')) return Response.json({ Status: 0, Answer: url.includes('AAAA') ? [] : [{ type: 1, data: '93.184.216.34' }] });
    return provider(url, init);
  }));
  return provider;
}
const response = (overrides = {}) => ({
  url: source,
  html: { success: true, data: page }, markdown: { success: true, data: 'Example tools for everyday work.' },
  metadata: { finalUrl: source, title: 'Example tools' },
  request_id: 'request-fixture', key_metadata: { credits_consumed: 1, credits_remaining: 999 },
  ...overrides,
});
beforeEach(() => {
  vi.stubEnv('CONTEXT_DEV_API_KEY', 'fixture-private-context-key');
  vi.stubEnv('SCRAPING_PROVIDER', 'context');
  vi.mocked(reserve).mockResolvedValue('reservation');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('Context.dev integration without live credit use', () => {
  it('routes extraction through Context with a reservation and private authorization', async () => {
    const fetcher = transport(response());
    const result = await scrape(ctx, source);
    expect(reserve).toHaveBeenCalledWith(ctx, 'CONTEXT_SCRAPE');
    expect(vi.mocked(reserve).mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[0]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.context.dev/v1/web/scrape');
    expect(init.redirect).toBe('manual');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer fixture-private-context-key' });
    expect(JSON.parse(String(init.body))).toMatchObject({ url: source, formats: { html: true, markdown: true }, sharedParams: { mainContentOnly: false } });
    expect(result.links).toContain('https://example.com/about');
    expect(result.metadata).toMatchObject({ provider: 'context.dev', requestId: 'request-fixture', creditsConsumed: 1, partial: false });
    expect(JSON.stringify(result)).not.toContain('fixture-private');
    expect(JSON.stringify(result)).not.toContain('credits_remaining');
    const identity = htmlStyleFallback(result);
    expect(identity.logos).toContain('https://example.com/logo.svg');
    expect(identity.taglines).toContain('Tools for everyday work.');
    expect(identity.colors[0]).toMatchObject({ value: '#123456', method: 'CSS declaration (not computed)' });
    expect(identity.truncated).toBe(true);
  });
  it('keeps valid Markdown when HTML fails and labels partial evidence', async () => {
    transport(response({ html: { success: false, data: '<p>Untrusted failed output</p>' }, isPartial: true }));
    const result = await contextScrape(ctx, source);
    expect(result.html).toBeUndefined();
    expect(result.markdown).toBe('Example tools for everyday work.');
    expect(result.metadata.partial).toBe(true);
    expect(result.error).toMatch(/partial/);
  });
  it('uses observed HTML text when Markdown fails', async () => {
    transport(response({ markdown: { success: false, data: 'fabricated failure payload' } }));
    const result = await contextScrape(ctx, source);
    expect(result.markdown).toContain('durable tools');
    expect(result.markdown).not.toContain('fabricated');
    expect(result.metadata.partial).toBe(true);
  });
  it('deduplicates map links, excludes other domains and records partial discovery', async () => {
    transport({ success: true, partial: true, urls: [{ url: source }, { url: source + 'about#team' }, { url: source + 'about' }, { url: 'https://other.example/' }, { url: 'javascript:alert(1)' }] });
    const result = await discover(ctx, source);
    expect(result).toEqual({ urls: ['https://example.com', source + 'about'], partial: true });
    expect(reserve).toHaveBeenCalledWith(ctx, 'CONTEXT_MAP');
  });
  it('routes external research through the selected provider', async () => {
    transport({ results: [{ url: source, title: 'Source', description: 'Observed result' }] });
    expect(await research(ctx, 'Example competitors')).toEqual([{ url: 'https://example.com', title: 'Source', description: 'Observed result' }]);
    expect(reserve).toHaveBeenCalledWith(ctx, 'CONTEXT_SEARCH');
  });
  it('makes no provider call when the spending reservation fails', async () => {
    const fetcher = transport(response());
    vi.mocked(reserve).mockRejectedValue(new Error('Workspace spending limit reached'));
    await expect(contextScrape(ctx, source)).rejects.toThrow('spending limit');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects private targets before reserving or calling the provider', async () => {
    const fetcher = transport(response());
    await expect(contextScrape(ctx, 'http://127.0.0.1/')).rejects.toThrow();
    expect(reserve).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects redirected content from a different site', async () => {
    transport(response({ metadata: { finalUrl: 'https://other.example/' } }));
    await expect(contextScrape(ctx, source)).rejects.toThrow('different website');
  });
  it.each([301, 302, 303, 307, 308, 401, 402, 429, 500])('reports status %s without leaking provider body or retrying', async status => {
    const fetcher = transport({ error: 'fixture-private-context-key' }, status);
    await expect(contextScrape(ctx, source)).rejects.toThrow(`(${status})`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed responses and empty failed outputs', async () => {
    transport({ html: { success: 'yes', data: page } });
    await expect(contextScrape(ctx, source)).rejects.toThrow('unexpected response format');
    transport(response({ html: { success: false }, markdown: { success: false } }));
    await expect(contextScrape(ctx, source)).rejects.toThrow('empty page');
  });
  it('does not infer provider validity from a configured key', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(serviceStatus().find(x => x.name === 'Website discovery')).toMatchObject({ ready: false, detail: expect.stringContaining('Context.dev selected; key configured') });
  });
  it('prefers Context when configured and respects an explicit Firecrawl choice', () => {
    vi.stubEnv('SCRAPING_PROVIDER', '');
    expect(scrapingProvider()).toBe('context');
    vi.stubEnv('SCRAPING_PROVIDER', 'firecrawl');
    expect(scrapingProvider()).toBe('firecrawl');
    vi.stubEnv('SCRAPING_PROVIDER', 'unknown');
    expect(scrapingProvider).toThrow('must be');
  });
});
