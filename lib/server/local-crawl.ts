import type { BrandDNA, Evidence, Finding } from '../contracts';
import { normalizeUrl } from '../domain';
import { boundedBytes } from './http';
import { publicFetch } from './public-fetch';
import { validatePublicUrl } from './security';
import { parsePage, plainText, safeLink } from './page-observations';
export { parsePage, plainText } from './page-observations';

export function observedStyles(css: string, url: string) {
  const colors: BrandDNA['colors'] = [];
  const fonts = new Set<string>();
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').split('}')) {
    const [selector, declarations] = rule.includes('{')
      ? rule.split(/\{([\s\S]*)/)
      : ['inline style', rule];
    for (const match of (declarations ?? '').matchAll(
      /(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g,
    )) {
      if (
        match[1] === 'font-family' &&
        /(?:^|[\s,])(?:html|body|:root)(?:$|[\s,.#:[>])/i.test(selector) &&
        !/var\(/i.test(match[2])
      )
        fonts.add(match[2].trim());
      for (const c of match[2].matchAll(
        /#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/gi,
      )) {
        if (c[0].startsWith('#') && ![4, 5, 7, 9].includes(c[0].length))
          continue;
        let value = c[0];
        if (value.endsWith('(')) {
          let depth = 1,
            end = c.index + value.length;
          while (end < match[2].length && depth) {
            if (match[2][end] === '(') depth++;
            if (match[2][end] === ')') depth--;
            end++;
          }
          if (depth) continue;
          value = match[2].slice(c.index, end);
        }
        // Unresolved var() expressions must not resolve against this app's CSS.
        if (/var\(/i.test(value)) continue;
        colors.push({
          value: value.toLowerCase(),
          selector: `${selector.trim().slice(0, 160)} · ${match[1]}`,
          url,
          method: 'CSS declaration (not computed)',
          count: 1,
        });
      }
    }
  }
  return { colors, fonts: [...fonts] };
}

// Unlike binary media, HTML can yield useful observations before a size limit.
// Keep the prefix, cancel the stream and explicitly record limited coverage.
export async function readTextPrefix(response: Response, limit = 2500000) {
  const reader = response.body?.getReader();
  if (!reader) return { text: '', truncated: false };
  const decoder = new TextDecoder();
  let text = '',
    size = 0,
    truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const available = limit - size;
      text += decoder.decode(value.subarray(0, available), { stream: true });
      size += value.length;
      if (size >= limit) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return { text, truncated };
}
async function readPublic(url: string, type: 'html' | 'css' | 'xml') {
  const result = await publicFetch(url, type === 'html' ? 12000 : 6000);
  const mime = result.response.headers.get('content-type') ?? '';
  if (type === 'html' && !/text\/html|application\/xhtml\+xml/i.test(mime)) {
    await result.response.body?.cancel();
    throw new Error('This address did not return an HTML page.');
  }
  if (type === 'css' && !/text\/css/i.test(mime)) {
    await result.response.body?.cancel();
    throw new Error('Stylesheet was not accessible as CSS.');
  }
  return {
    url: result.url,
    ...(await readTextPrefix(
      result.response,
      type === 'html' ? 2500000 : 500000,
    )),
  };
}
type Page = ReturnType<typeof parsePage>;
type Observation = {
  page: Page;
  method: 'dom' | 'research';
  truncated: boolean;
  retrieval: string;
};
const challenge = (page: Page) =>
  /^(just a moment|access denied|attention required|checking your browser|verify you are human|please wait)(\b|[.!])/i.test(
    page.title.trim(),
  );
const usable = (page: Page) =>
  !challenge(page) &&
  !!(page.description || page.paragraphs.length || page.text.length > 80);
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Page could not be read';
const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

async function readerFallback(url: string): Promise<Observation> {
  // Public URL only; no cookies, credentials, user files or paid keys are sent.
  await validatePublicUrl(url);
  const response = await fetch('https://r.jina.ai/' + url, {
    headers: {
      accept: 'application/json',
      'x-no-cache': 'true',
      'x-with-generated-alt': 'false',
    },
    signal: AbortSignal.timeout(18000),
    redirect: 'error',
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Public reader unavailable (${response.status}).`);
  }
  const result = JSON.parse(
    new TextDecoder().decode(await boundedBytes(response, 1500000)),
  ) as {
    code?: number;
    data?: {
      title?: string;
      description?: string;
      url?: string;
      content?: string;
      httpStatus?: number;
      warning?: string;
    };
  };
  const data = result.data;
  if (
    !data ||
    (result.code && result.code !== 200) ||
    (data.httpStatus && data.httpStatus >= 400) ||
    typeof data.content !== 'string'
  )
    throw new Error(
      'The public reader did not return accessible page content.',
    );
  const sourceUrl = await validatePublicUrl(data.url || url);
  if (
    new URL(sourceUrl).hostname.replace(/^www\./, '') !==
    new URL(url).hostname.replace(/^www\./, '')
  )
    throw new Error('The reader returned a different website.');
  const paragraphs = data.content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .split(/\n\s*\n/)
    .slice(0, 80);
  const page = parsePage(
    `<html><head><title>${escape(data.title || '')}</title><meta name="description" content="${escape(data.description || '')}"></head><body><main>${paragraphs.map((p) => `<p>${escape(p.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'))}</p>`).join('')}</main></body></html>`,
    sourceUrl,
  );
  page.links = [
    ...data.content.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g),
  ].flatMap((m) => safeLink(m[1], sourceUrl) ?? []);
  if (!usable(page))
    throw new Error('The public reader returned a challenge or an empty page.');
  return {
    page,
    method: 'research',
    truncated: paragraphs.length >= 80,
    retrieval: `Public reader (Jina); retrieved ${new Date().toISOString()}${data.warning ? '. ' + data.warning : ''}`,
  };
}

export async function crawlWebsite(
  raw: string,
  onProgress?: (result: ScanResult) => void,
) {
  const start = normalizeUrl(
    /^https?:\/\//i.test(raw.trim()) ? raw.trim() : 'https://' + raw.trim(),
  );
  // Validate before any fallback or discovery, including a failed first fetch.
  await validatePublicUrl(start);
  const deadline = Date.now() + 65000;
  let base = start;
  const discovered = new Set([start]),
    visited = new Set<string>(),
    completed = new Set<string>();
  const failed: string[] = [],
    excluded: string[] = [],
    warnings: string[] = [];
  const pages: Observation[] = [],
    styles: ReturnType<typeof observedStyles>[] = [];
  const cssSeen = new Set<string>();
  const sameSite = (url: string) =>
    new URL(url).hostname.replace(/^www\./, '') ===
    new URL(base).hostname.replace(/^www\./, '');
  const add = (url: string) => {
    if (
      !sameSite(url) ||
      /\.(?:png|jpe?g|webp|gif|svg|pdf|zip|mp4|css|js|woff2?)$/i.test(
        new URL(url).pathname,
      )
    ) {
      if (excluded.length < 100 && !excluded.includes(url)) excluded.push(url);
    } else if (discovered.size < 100) discovered.add(url);
  };
  const snapshot = () =>
    assemble(pages, styles, discovered, visited, failed, excluded, warnings);
  async function visit(url: string, isRoot = false) {
    visited.add(url);
    let observation: Observation;
    try {
      let direct: Observation | undefined,
        directError = '';
      try {
        const fetched = await readPublic(url, 'html');
        direct = {
          page: parsePage(fetched.text, fetched.url),
          truncated: fetched.truncated,
          method: 'dom',
          retrieval: 'Direct website HTML',
        };
        if (challenge(direct.page)) {
          direct = undefined;
          throw new Error(
            'The website returned an automated-access challenge.',
          );
        }
      } catch (e) {
        directError = message(e);
      }
      if (
        (!direct || !usable(direct.page)) &&
        isRoot &&
        Date.now() < deadline - 18000
      ) {
        try {
          const recovered = await readerFallback(url);
          // Keep direct metadata/assets when the reader supplies missing visible copy.
          if (direct) {
            recovered.page = {
              ...direct.page,
              text: recovered.page.text,
              paragraphs: recovered.page.paragraphs,
              links: [
                ...new Set([...direct.page.links, ...recovered.page.links]),
              ],
            };
          }
          observation = recovered;
        } catch (e) {
          if (!direct || !usable(direct.page))
            throw new Error(
              `${directError || 'No readable page content.'} ${message(e)}`,
            );
          observation = direct;
        }
      } else if (direct && usable(direct.page)) observation = direct;
      else
        throw new Error(
          directError || 'No readable content in the returned page.',
        );
      if (isRoot) base = observation.page.url;
      if (!sameSite(observation.page.url))
        throw new Error('Page redirected outside the selected brand website.');
      const finalUrl = observation.page.url;
      visited.add(finalUrl);
      discovered.add(finalUrl);
      if (completed.has(finalUrl)) return;
      completed.add(finalUrl);
      pages.push(observation);
      if (observation.truncated)
        warnings.push(`Read a bounded portion of the large page: ${finalUrl}`);
      for (const link of observation.page.links) add(link);
      styles.push(observedStyles(observation.page.css, finalUrl));
      onProgress?.(snapshot());
      const sheets = observation.page.stylesheets
        .filter((s) => !cssSeen.has(s))
        .slice(0, Math.min(2, 5 - cssSeen.size));
      if (Date.now() < deadline - 7000) {
        await Promise.all(
          sheets.map(async (sheet) => {
            cssSeen.add(sheet);
            try {
              const css = await readPublic(sheet, 'css');
              styles.push(observedStyles(css.text, css.url));
              if (css.truncated)
                warnings.push(`Stylesheet inventory is partial: ${sheet}`);
            } catch {
              warnings.push(`Stylesheet unavailable: ${sheet}`);
            }
          }),
        );
      }
    } catch (e) {
      failed.push(url);
      warnings.push(`${url}: ${message(e)}`);
    }
  }
  await visit(start, true);
  // A sitemap can recover accessible pages even when the homepage is blocked.
  const sitemaps = [new URL('/sitemap.xml', base).href];
  const seenSitemaps = new Set<string>();
  while (
    sitemaps.length &&
    seenSitemaps.size < 3 &&
    Date.now() < deadline - 8000
  ) {
    const url = sitemaps.shift()!;
    if (seenSitemaps.has(url)) continue;
    seenSitemaps.add(url);
    try {
      const sitemap = await readPublic(url, 'xml');
      const isIndex = /<(?:\w+:)?sitemapindex\b/i.test(sitemap.text);
      for (const match of sitemap.text.matchAll(
        /<(?:\w+:)?loc\b[^>]*>\s*([\s\S]*?)\s*<\/(?:\w+:)?loc>/gi,
      )) {
        const link = safeLink(
          plainText(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')),
          base,
        );
        if (!link || !sameSite(link)) continue;
        if (isIndex) {
          if (sitemaps.length < 3 && !seenSitemaps.has(link))
            sitemaps.push(link);
        } else add(link);
      }
    } catch {
      /* Internal links remain a valid discovery path. */
    }
  }
  // Read brand/about/product pages before legal pages and unbounded catalogs.
  const rank = (url: string) =>
    /about|story|brand|company/i.test(new URL(url).pathname)
      ? 0
      : /product|service|shop/i.test(new URL(url).pathname)
        ? 1
        : /privacy|terms|login|cart|account/i.test(new URL(url).pathname)
          ? 9
          : 3;
  let attempts = 1;
  while (attempts < 6 && Date.now() < deadline - 13000) {
    const next = [...discovered]
      .filter((u) => !visited.has(u))
      .sort((a, b) => rank(a) - rank(b))[0];
    if (!next) break;
    await visit(next);
    attempts++;
  }
  if (!pages.length)
    throw new Error(
      `No readable pages were returned by this website or the public reader. ${warnings[0] ?? 'Check the website address.'}`,
    );
  return snapshot();
}

function assemble(
  pages: Observation[],
  styles: ReturnType<typeof observedStyles>[],
  discovered: Set<string>,
  visited: Set<string>,
  failed: string[],
  excluded: string[],
  warnings: string[],
) {
  const now = new Date().toISOString();
  const evidence: Evidence[] = [];
  const cite = (
    p: Observation,
    excerpt: string,
    selector: string,
    metadata = false,
  ) => {
    const id = crypto.randomUUID();
    evidence.push({
      id,
      url: p.page.url,
      excerpt,
      selector,
      observedAt: now,
      method: metadata ? 'metadata' : p.method,
      confidence: p.method === 'research' ? 0.85 : 1,
    });
    return id;
  };
  const first = pages[0];
  const identityEvidence: Record<string, string[]> = {};
  for (const key of ['name', 'tagline', 'logo'] as const) {
    if (first.page[key])
      identityEvidence[key] = [
        cite(
          first,
          first.page[key],
          first.page.identity[key],
          first.page.identity[key].includes('meta') ||
            first.page.identity[key].includes('script'),
        ),
      ];
  }
  const overview: Finding[] = [];
  const seenText = new Set<string>();
  const pageResults = pages.map((p) => {
    const snippets = p.page.description
      ? [{ text: p.page.description, selector: 'description metadata' }]
      : p.page.paragraphs.slice(0, 2);
    const findings: Finding[] = snippets.map((s) => ({
      text: s.text,
      type: 'fact',
      evidenceIds: [
        cite(p, s.text, s.selector, s.selector === 'description metadata'),
      ],
    }));
    for (const finding of findings)
      if (overview.length < 4 && !seenText.has(finding.text)) {
        seenText.add(finding.text);
        overview.push(finding);
      }
    const seoIssues =
      p.method === 'dom' && !p.truncated
        ? [
            ...(!p.page.title ? ['Missing page title'] : []),
            ...(!p.page.description ? ['Missing description metadata'] : []),
            ...(!p.page.h1.length
              ? ['No H1 heading found in the returned HTML']
              : []),
          ]
        : [];
    return {
      url: p.page.url,
      title: p.page.title,
      thumbnail: p.page.thumbnail,
      retrieval: p.retrieval,
      summary: {
        summary: findings[0]?.text || p.page.text.slice(0, 900),
        insights: findings.slice(1),
        seoIssues,
        headings: p.page.headings.slice(0, 8),
        canonical: p.page.canonical,
      },
      evidence: evidence.filter((e) => e.url === p.page.url),
    };
  });
  const colors = styles.flatMap((s) => s.colors).slice(0, 5000);
  // Only explicit primary/brand declarations are palette candidates. Counting all
  // CSS colors mistakes component demos, customer brands and themes for identity.
  const palette = [
    ...new Set(
      colors
        .filter((c) =>
          /(?:--(?:color-)?(?:brand|primary)|\.brand(?:\W|$))/i.test(
            c.selector,
          ),
        )
        .map((c) => c.value),
    ),
  ].slice(0, 6);
  const coverage = {
    discovered: discovered.size,
    completed: pages.length,
    failed: failed.length,
    excluded: excluded.length,
    status: 'partial' as const,
  };
  const dna: Omit<BrandDNA, 'brandId'> = {
    schemaVersion: 1,
    version: Date.now(),
    name: first.page.name,
    tagline: first.page.tagline,
    logo: first.page.logo,
    identityEvidence,
    overview,
    values: [],
    aesthetics: [],
    voice: [],
    strengths: [],
    weaknesses: [],
    opportunities: [],
    marketGaps: [],
    competitors: [],
    recommendations: {},
    fonts: [...new Set(styles.flatMap((s) => s.fonts))],
    colors,
    palette,
    evidence,
    coverage,
    createdAt: now,
  };
  return {
    scan: {
      ...coverage,
      completed: pages.map((p) => p.page.url),
      failed: [...failed],
      excluded: [...excluded],
      queue: [...discovered].filter((u) => !visited.has(u)),
      agent: 2,
      warnings: [...new Set(warnings)],
      coverageNote:
        'Bounded public-page scan. CSS declarations are observed, not computed; unverified brand traits are left empty.',
      error: null,
    },
    dna,
    pages: pageResults,
  };
}
export type ScanResult = ReturnType<typeof assemble>;
