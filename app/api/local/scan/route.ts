import { z } from 'zod';
import { providerJSON } from '@/lib/server/providers';
import { required } from '@/lib/server/env';
import { validatePublicUrl } from '@/lib/server/security';

export const dynamic = 'force-dynamic';

function localOnly() {
  if (process.env.NODE_ENV === 'production')
    throw Object.assign(
      new Error(
        'Local workspace processing is available only in local development.',
      ),
      { status: 403 },
    );
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export async function POST(request: Request) {
  try {
    localOnly();
    const { url } = z.object({ url: z.url() }).parse(await request.json());
    const website = await validatePublicUrl(url);
    const headers = {
      authorization: `Bearer ${required('FIRECRAWL_API_KEY')}`,
      'content-type': 'application/json',
    };
    const mapped = await providerJSON<{ links?: { url: string }[] }>(
      'https://api.firecrawl.dev/v2/map',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url: website,
          limit: 12,
          includeSubdomains: false,
        }),
      },
    );
    const host = new URL(website).hostname;
    const pages = [
      ...new Set([website, ...(mapped.links ?? []).map((x) => x.url)]),
    ]
      .filter((candidate) => {
        try {
          return new URL(candidate).hostname === host;
        } catch {
          return false;
        }
      })
      .slice(0, 12);
    const results = await Promise.allSettled(
      pages.map((page) =>
        providerJSON<{
          success: boolean;
          data: {
            markdown?: string;
            html?: string;
            metadata?: Record<string, unknown>;
          };
        }>('https://api.firecrawl.dev/v2/scrape', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            url: page,
            formats: ['markdown', 'html'],
            onlyMainContent: false,
          }),
        }),
      ),
    );
    const observedAt = new Date().toISOString();
    const completed = results
      .map((result, index) => ({ result, url: pages[index] }))
      .filter((x) => x.result.status === 'fulfilled' && x.result.value.success);
    const first =
      completed[0]?.result.status === 'fulfilled'
        ? completed[0].result.value.data
        : undefined;
    if (!first) throw new Error('The website could not be read by Firecrawl.');
    const metadata = first.metadata ?? {};
    const html = first.html ?? '';
    const title = text(metadata.title);
    const description = text(metadata.description);
    const headings = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
      .map((match) => stripHtml(match[1]))
      .filter(Boolean);
    const logo =
      html.match(
        /<img[^>]+(?:alt=["'][^"']*logo[^"']*["'][^>]*src|src=["']([^"']+)["'][^>]*alt=["'][^"']*logo)/i,
      )?.[1] ?? null;
    const evidence = completed.map(({ result, url: page }) => {
      const data = result.status === 'fulfilled' ? result.value.data : {};
      return {
        id: crypto.randomUUID(),
        url: page,
        excerpt: text(data.markdown).slice(0, 500),
        observedAt,
        method: 'dom' as const,
        confidence: 1,
      };
    });
    const rootEvidence = evidence[0];
    return Response.json({
      scan: {
        discovered: pages.length,
        completed: completed.map((x) => x.url),
        failed: results
          .map((result, index) =>
            result.status === 'rejected' ? pages[index] : null,
          )
          .filter(Boolean),
        excluded: [],
        status: completed.length === pages.length ? 'complete' : 'partial',
      },
      dna: {
        schemaVersion: 1,
        version: Date.now(),
        name:
          (text(metadata.ogTitle) || text(metadata.siteName) || title).trim() ||
          null,
        tagline: headings[0] ?? null,
        logo,
        overview:
          description && rootEvidence
            ? [
                {
                  text: description,
                  type: 'fact',
                  evidenceIds: [rootEvidence.id],
                },
              ]
            : [],
        values: [],
        aesthetics: [],
        voice: [],
        strengths: [],
        weaknesses: [],
        opportunities: [],
        marketGaps: [],
        competitors: [],
        recommendations: {},
        fonts: [],
        colors: [],
        palette: [],
        evidence,
        coverage: {
          discovered: pages.length,
          completed: completed.length,
          failed: pages.length - completed.length,
          excluded: 0,
          status: completed.length === pages.length ? 'complete' : 'partial',
        },
        createdAt: observedAt,
      },
    });
  } catch (error) {
    const e = error as Error & { status?: number };
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
