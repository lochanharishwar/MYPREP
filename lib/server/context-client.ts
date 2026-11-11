import 'server-only';
import { z } from 'zod';
import { env, required } from './env';
import { reserve, type BillingContext } from './billing';
import { boundedBytes } from './http';
import { validatePublicUrl } from './security';
import { normalizeUrl } from '../domain';
import { parsePage, safeLink } from './page-observations';

export function scrapingProvider() {
  const selected = env('SCRAPING_PROVIDER', env('CONTEXT_DEV_API_KEY') ? 'context' : 'firecrawl');
  if (selected !== 'context' && selected !== 'firecrawl')
    throw new Error('SCRAPING_PROVIDER must be context or firecrawl.');
  return selected;
}
export function requireScrapingProvider() {
  const provider = scrapingProvider();
  required(provider === 'context' ? 'CONTEXT_DEV_API_KEY' : 'FIRECRAWL_API_KEY');
  return provider;
}

// Every entry point reserves before dispatch. This client is deliberately not
// called by the anonymous, keyless /api/local/scan endpoint.
async function request(ctx: BillingContext, operation: 'MAP' | 'SCRAPE' | 'SEARCH', path: string, body?: unknown) {
  const key = required('CONTEXT_DEV_API_KEY');
  await reserve(ctx, 'CONTEXT_' + operation);
  let response: Response;
  try {
    response = await fetch('https://api.context.dev/v1' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(65000),
      redirect: 'manual',
    });
  } catch {
    // An uncertain timeout is not automatically replayed inside the adapter.
    throw new Error('Context.dev did not complete the request. Check provider request history before retrying.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Context.dev request failed (${response.status}). Check key access, credits and rate limits.`);
  }
  try {
    return JSON.parse(new TextDecoder().decode(await boundedBytes(response, 8000000))) as unknown;
  } catch {
    throw new Error('Context.dev returned an invalid or oversized response.');
  }
}

const output = z.object({ success: z.boolean().nullable().optional(), data: z.string().nullable().optional() });
const receipt = z.object({ credits_consumed: z.number().nonnegative().optional() }).optional();
const scrapeResponse = z.object({
  url: z.string().optional(),
  html: output.optional(), markdown: output.optional(),
  isPartial: z.boolean().optional(),
  metadata: z.object({ sourceUrl: z.string().optional(), finalUrl: z.string().optional(), title: z.string().optional(), description: z.string().optional() }).optional(),
  request_id: z.string().optional(), key_metadata: receipt,
});
function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error('Context.dev returned an unexpected response format.');
  return result.data;
}
export async function contextDiscover(ctx: BillingContext, url: string) {
  await validatePublicUrl(url);
  const query = new URLSearchParams({ domain: new URL(url).hostname, maxLinks: '5000', includeSubdomains: 'false', 'timeoutOpts[milliseconds]': '45000', 'timeoutOpts[behavior]': 'return-partial' });
  const result = parsed(z.object({ success: z.boolean(), urls: z.array(z.object({ url: z.string() })).max(5000), partial: z.boolean().optional() }),
    await request(ctx, 'MAP', '/web/urls?' + query));
  if (!result.success) throw new Error('Context.dev could not discover this website.');
  const urls = [...new Set([url, ...result.urls.map(x => x.url)].flatMap(value => {
    try {
      const candidate = normalizeUrl(value);
      return new URL(candidate).hostname === new URL(url).hostname ? [candidate] : [];
    } catch { return []; }
  }))];
  return { urls, partial: !!result.partial || result.urls.length >= 5000 };
}
export async function contextScrape(ctx: BillingContext, url: string) {
  await validatePublicUrl(url);
  const result = parsed(scrapeResponse, await request(ctx, 'SCRAPE', '/web/scrape', {
    url, formats: { html: true, markdown: true },
    sharedParams: { mainContentOnly: false },
    timeoutOpts: { milliseconds: 60000, behavior: 'return-partial' },
  }));
  const finalUrl = await validatePublicUrl(result.metadata?.finalUrl || result.url || url);
  if (new URL(finalUrl).hostname.replace(/^www\./, '') !== new URL(url).hostname.replace(/^www\./, ''))
    throw new Error('Context.dev returned a different website.');
  const html = result.html?.success === true ? result.html.data?.trim() || undefined : undefined;
  const page = html ? parsePage(html, finalUrl) : undefined;
  const markdown = (result.markdown?.success === true ? result.markdown.data?.trim() : '') || page?.text || '';
  if (!markdown || /^(just a moment|access denied|attention required|checking your browser|verify you are human)\b/i.test(page?.title || result.metadata?.title || ''))
    throw new Error('Context.dev returned an empty page or an access challenge.');
  const partial = !!result.isPartial || !html || result.markdown?.success !== true;
  return {
    url: finalUrl, html, markdown,
    links: page?.links ?? [...markdown.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)].flatMap(m => safeLink(m[1], finalUrl) ?? []),
    metadata: {
      ...result.metadata, provider: 'context.dev', requestId: result.request_id,
      creditsConsumed: result.key_metadata?.credits_consumed,
      retrievedAt: new Date().toISOString(), partial,
    },
    ...(partial ? { error: 'Context.dev returned partial page outputs; missing fields have not been inferred.' } : {}),
  };
}
export async function contextResearch(ctx: BillingContext, query: string) {
  const result = parsed(z.object({ results: z.array(z.object({ url: z.string(), title: z.string(), description: z.string().nullable().optional() })).max(5) }),
    await request(ctx, 'SEARCH', '/web/search', { query: query.slice(0, 2000), numResults: 5, descriptionMaxCharacters: 2000 }));
  return result.results.flatMap(item => {
    const url = safeLink(item.url, 'https://example.com');
    return url ? [{ url, title: item.title, description: item.description ?? '' }] : [];
  });
}
