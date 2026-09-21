import type { BrandDNA, Evidence } from '../contracts';
import { normalizeUrl } from '../domain';
import { boundedBytes } from './http';
import { publicFetch } from './public-fetch';

// Basic public HTML analysis. Missing facts stay missing.
export function plainText(html: string) {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => {
      const code =
        n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(
      /&(amp|quot|apos|lt|gt|nbsp);/g,
      (_, n: string) =>
        ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[n] ??
        '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}
function attributes(tag: string) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
      (x) => [x[1].toLowerCase(), plainText(x[2] ?? x[3] ?? x[4] ?? '')],
    ),
  );
}
function safeLink(raw: string, base: string) {
  try {
    return normalizeUrl(new URL(raw, base).href);
  } catch {
    return null;
  }
}
export function parsePage(html: string, url: string) {
  const meta = Object.fromEntries(
    [...html.matchAll(/<meta\b[^>]*>/gi)].map((x) => {
      const a = attributes(x[0]);
      return [a.name ?? a.property, a.content ?? ''];
    }),
  );
  const headings = [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((x) => plainText(x[1]))
    .filter(Boolean);
  const tagline = [
    ...html.matchAll(
      /<(?:p|h[1-6]|span|div)\b([^>]*)>([^<]+)<\/(?:p|h[1-6]|span|div)>/gi,
    ),
  ].find((x) =>
    /tagline|slogan/i.test(
      [attributes(x[1]).class, attributes(x[1]).id].join(' '),
    ),
  );
  const logo = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((x) => attributes(x[0]))
    .find((a) => /logo/i.test([a.alt, a.class, a.id, a.src].join(' ')));
  const links = [...html.matchAll(/<(?:a|link)\b[^>]*>/gi)].map((x) =>
    attributes(x[0]),
  );
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (x) => x[1],
  );
  const inline = [
    ...html.matchAll(/<[^>]+\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi),
  ].map((x) => {
    const a = attributes(x[0]);
    const tag = x[0].match(/^<([\w:-]+)/)?.[1] ?? 'element';
    const selector = a.id
      ? `${tag}#${a.id}`
      : a.class
        ? `${tag}.${a.class.trim().split(/\s+/).slice(0, 3).join('.')}`
        : `${tag}[style]`;
    return `${selector} { ${x[1] ?? x[2]} }`;
  });
  return {
    url,
    title: plainText(
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '',
    ),
    name: meta['og:site_name'] || null,
    description: meta.description || meta['og:description'] || '',
    tagline: tagline ? plainText(tagline[2]) : null,
    logo: logo?.src ? safeLink(logo.src, url) : null,
    headings,
    text: plainText(html).slice(0, 20000),
    links: [...html.matchAll(/<a\b[^>]*>/gi)]
      .map((x) => attributes(x[0]))
      .filter((a) => a.href)
      .flatMap((a) => {
        const u = safeLink(a.href, url);
        return u ? [u] : [];
      }),
    stylesheets: links
      .filter((a) => a.href && a.rel?.split(' ').includes('stylesheet'))
      .flatMap((a) => {
        const u = safeLink(a.href, url);
        return u ? [u] : [];
      }),
    css: [...styles, ...inline].join('\n'),
  };
}
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
      if (match[1] === 'font-family') fonts.add(match[2].trim());
      for (const c of match[2].matchAll(
        /#[\da-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi,
      )) {
        if (c[0].startsWith('#') && ![4, 5, 7, 9].includes(c[0].length))
          continue;
        colors.push({
          value: c[0].toLowerCase(),
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
async function readPublic(url: string, type: 'html' | 'css' | 'xml') {
  const result = await publicFetch(url);
  const mime = result.response.headers.get('content-type') ?? '';
  if (type === 'html' && !/text\/html|application\/xhtml\+xml/i.test(mime))
    throw new Error('This address did not return an HTML page.');
  if (type === 'css' && !/text\/css/i.test(mime))
    throw new Error('Stylesheet was not accessible as CSS.');
  return {
    url: result.url,
    text: new TextDecoder().decode(
      await boundedBytes(result.response, type === 'html' ? 1500000 : 500000),
    ),
  };
}
export async function crawlWebsite(raw: string) {
  const start = normalizeUrl(
    /^https?:\/\//i.test(raw.trim()) ? raw.trim() : 'https://' + raw.trim(),
  );
  const root = await readPublic(start, 'html');
  const host = new URL(root.url).hostname;
  const discovered = new Set([root.url]);
  const visited = new Set<string>();
  const failed: string[] = [];
  const excluded: string[] = [];
  const warnings: string[] = [];
  const pages: ReturnType<typeof parsePage>[] = [];
  const cssSeen = new Set<string>();
  const styles: ReturnType<typeof observedStyles>[] = [];
  const add = (u: string) => {
    if (
      new URL(u).hostname !== host ||
      /\.(?:png|jpe?g|webp|gif|svg|pdf|zip|mp4|css|js)$/i.test(
        new URL(u).pathname,
      )
    ) {
      if (excluded.length < 100) excluded.push(u);
      return;
    }
    if (discovered.size < 100) discovered.add(u);
  };
  try {
    const sitemap = await readPublic(
      new URL('/sitemap.xml', root.url).href,
      'xml',
    );
    for (const m of sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
      const u = safeLink(plainText(m[1]), root.url);
      if (u && !u.endsWith('.xml')) add(u);
    }
  } catch {
    warnings.push('Sitemap unavailable; following public internal links.');
  }
  const queue = [root.url];
  let rootPending = true;
  const deadline = Date.now() + 55000;
  while (queue.length && visited.size < 6 && Date.now() < deadline) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const fetched = rootPending ? root : await readPublic(url, 'html');
      rootPending = false;
      const page = parsePage(fetched.text, fetched.url);
      pages.push(page);
      styles.push(observedStyles(page.css, page.url));
      for (const u of page.links) add(u);
      for (const sheet of page.stylesheets.slice(0, 3)) {
        if (cssSeen.has(sheet) || cssSeen.size >= 6 || Date.now() > deadline)
          continue;
        cssSeen.add(sheet);
        try {
          const css = await readPublic(sheet, 'css');
          styles.push(observedStyles(css.text, css.url));
        } catch {
          warnings.push(`Could not read stylesheet: ${sheet}`);
        }
      }
    } catch (error) {
      failed.push(url);
      warnings.push(
        `${url}: ${error instanceof Error ? error.message : 'Read failed'}`,
      );
    }
    for (const u of discovered)
      if (!visited.has(u) && !queue.includes(u)) queue.push(u);
  }
  if (!pages.length) throw new Error('No website pages could be read.');
  const now = new Date().toISOString();
  const evidence: Evidence[] = pages.flatMap((p) => [
    {
      id: crypto.randomUUID(),
      url: p.url,
      excerpt: p.description || p.text.slice(0, 1500),
      observedAt: now,
      method: 'dom' as const,
      confidence: 1,
    },
    ...[p.name, p.tagline, p.logo]
      .filter((x): x is string => !!x)
      .map((excerpt) => ({
        id: crypto.randomUUID(),
        url: p.url,
        excerpt,
        observedAt: now,
        method: 'dom' as const,
        confidence: 1,
      })),
  ]);
  const colors = styles.flatMap((s) => s.colors);
  const counts = new Map<string, number>();
  for (const c of colors) counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
  const first = pages[0];
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
    name: first.name || first.title || null,
    tagline: first.tagline,
    logo: first.logo,
    overview: first.description
      ? [
          {
            text: first.description,
            type: 'fact',
            evidenceIds: [evidence[0].id],
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
    fonts: [...new Set(styles.flatMap((s) => s.fonts))],
    colors,
    palette: [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map((x) => x[0]),
    evidence,
    coverage,
    createdAt: now,
  };
  return {
    scan: {
      ...coverage,
      completed: pages.map((p) => p.url),
      failed,
      excluded,
      queue: [...discovered].filter((u) => !visited.has(u)),
      agent: 2,
      error:
        'Basic HTML scan; JavaScript-rendered pages and computed styles are not included. ' +
        warnings.join(' '),
    },
    dna,
    pages: pages.map((p) => ({
      url: p.url,
      summary: {
        summary: p.description || p.text.slice(0, 900),
        insights: [],
        seoIssues: [
          ...(!p.title ? ['Missing page title'] : []),
          ...(!p.description ? ['Missing description metadata'] : []),
        ],
      },
    })),
  };
}
