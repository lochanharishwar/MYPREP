import { parseHTML } from 'linkedom';
import { normalizeUrl } from '../domain';

export function safeLink(raw: string | null | undefined, base: string) {
  if (!raw?.trim()) return null;
  try {
    return normalizeUrl(new URL(raw, base).href);
  } catch {
    return null;
  }
}
const clean = (text: string | null | undefined) =>
  (text ?? '').replace(/\s+/g, ' ').trim();
const string = (value: unknown) =>
  typeof value === 'string' ? clean(value).slice(0, 2000) : '';

// Parse inert HTML, never execute page scripts. Script strings, code samples,
// hidden templates and customer logos are not the site's own brand identity.
export function parsePage(html: string, url: string) {
  const { document } = parseHTML(html);
  const all = (selector: string) => [...document.querySelectorAll(selector)];
  const json: Record<string, unknown>[] = [];
  function collect(value: unknown, depth = 0) {
    if (depth > 6 || json.length >= 100 || !value || typeof value !== 'object')
      return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((v) => collect(v, depth + 1));
      return;
    }
    const object = value as Record<string, unknown>;
    json.push(object);
    if (object['@graph']) collect(object['@graph'], depth + 1);
    if (object.publisher) collect(object.publisher, depth + 1);
  }
  for (const script of all('script[type="application/ld+json"]').slice(0, 20)) {
    try {
      if ((script.textContent?.length ?? 0) < 200000)
        collect(JSON.parse(script.textContent ?? ''));
    } catch {
      /* Invalid structured data is not evidence. */
    }
  }
  const organizations = json.filter((o) => {
    const types = Array.isArray(o['@type']) ? o['@type'] : [o['@type']];
    if (
      !types.some((t) =>
        [
          'Organization',
          'Corporation',
          'Brand',
          'LocalBusiness',
          'OnlineStore',
        ].includes(String(t)),
      )
    )
      return false;
    const declared = safeLink(string(o.url), url);
    return (
      !declared ||
      new URL(declared).hostname.replace(/^www\./, '') ===
        new URL(url).hostname.replace(/^www\./, '')
    );
  });
  // Prefer an explicitly first-party entity over an unscoped publisher/partner.
  const organization =
    organizations.find((o) => safeLink(string(o.url), url)) ?? organizations[0];
  const meta = Object.fromEntries(
    all('meta').map((e) => [
      (
        e.getAttribute('name') ||
        e.getAttribute('property') ||
        ''
      ).toLowerCase(),
      clean(e.getAttribute('content')),
    ]),
  );
  const title = clean(document.querySelector('title')?.textContent);
  const css = all('style').map((e) => e.textContent ?? '');
  const stylesheets = all('link[rel~="stylesheet"]').flatMap(
    (e) => safeLink(e.getAttribute('href'), url) ?? [],
  );
  const canonical = safeLink(
    document.querySelector('link[rel~="canonical"]')?.getAttribute('href'),
    url,
  );
  const thumbnail = safeLink(meta['og:image'] || meta['twitter:image'], url);
  all(
    'script, style, noscript, template, pre, code, [hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"]',
  ).forEach((e) => e.remove());
  const selector = (e: Element) =>
    e.id
      ? `${e.localName}#${e.id}`
      : e.className
        ? `${e.localName}.${String(e.className).trim().split(/\s+/).slice(0, 3).join('.')}`
        : e.localName;
  for (const e of all('[style]'))
    css.push(
      `${selector(e)}${e.id || e.className ? '' : '[style]'} { ${e.getAttribute('style')} }`,
    );
  const headings = all('h1, h2, h3')
    .map((e) => clean(e.textContent))
    .filter(Boolean)
    .slice(0, 40);
  const h1 = all('h1')
    .map((e) => clean(e.textContent))
    .filter(Boolean);
  const main =
    document.querySelector('main, article, [role="main"]') ?? document.body;
  const paragraphElements = [
    ...(main?.querySelectorAll('p, li, dd, blockquote') ?? []),
  ]
    .filter((e) => !e.querySelector('p, li, dd, h1, h2, h3, h4, button'))
    .filter(
      (e) =>
        !e.closest(
          'nav, footer, aside, blockquote, [class*="testimonial" i], [class*="quote" i]',
        ),
    )
    .filter(
      (e) =>
        !e.closest(
          '[role="dialog"], [class*="cookie"], [id*="cookie"], [class*="consent"]',
        ),
    );
  const paragraphs = paragraphElements
    .map((e) => ({
      text: clean(e.textContent),
      selector: selector(e),
      heading: clean(
        e.closest('section, article')?.querySelector('h1, h2, h3, h4')
          ?.textContent,
      ),
    }))
    .filter((p) => p.text.length >= 30 && p.text.length <= 1200)
    .filter(
      (p, i, all) => all.findIndex((other) => other.text === p.text) === i,
    )
    .slice(0, 50);
  const taglineCandidates = all('[class], [id], [itemprop="slogan"]').filter(
    (e) =>
      (/(?:^|\s)(?:[\w-]+[-_])?(?:tagline|slogan)(?:$|\s)/i.test(
        `${e.className} ${e.id}`,
      ) ||
        e.getAttribute('itemprop') === 'slogan') &&
      !e.closest(
        'footer, aside, [itemtype*="Product"], [class*="testimonial" i], [class*="review" i], [class*="demo" i], [class*="preview" i]',
      ) &&
      clean(e.textContent).length >= 8 &&
      clean(e.textContent).length <= 240,
  );
  const explicitBrandTagline = taglineCandidates.find(
    (e) =>
      /(?:brand|site)[-_](?:tagline|slogan)/i.test(`${e.className} ${e.id}`) ||
      e.getAttribute('itemprop') === 'slogan',
  );
  const onlyTagline =
    new Set(taglineCandidates.map((e) => clean(e.textContent))).size === 1
      ? taglineCandidates[0]
      : undefined;
  const brandPage = /^\/$|\/(?:about|company|our-story|brand)(?:\/|$)/i.test(
    new URL(url).pathname,
  );
  // A product tagline on a catalog or product page is not the company slogan.
  const taglineElement =
    explicitBrandTagline ?? (brandPage ? onlyTagline : undefined);
  const schemaLogo = organization?.logo;
  const structuredLogo =
    typeof schemaLogo === 'string'
      ? schemaLogo
      : schemaLogo && typeof schemaLogo === 'object'
        ? string((schemaLogo as Record<string, unknown>).url) ||
          string((schemaLogo as Record<string, unknown>).contentUrl)
        : '';
  const headerLogo = all(
    'header img, nav img, [role="banner"] img, a[href="/"] img',
  ).find((e) =>
    /logo/i.test(
      [
        e.getAttribute('alt'),
        e.getAttribute('class'),
        e.getAttribute('src'),
      ].join(' '),
    ),
  );
  const explicitLogo = all('img').find(
    (e) =>
      /logo/i.test(
        [
          e.getAttribute('alt'),
          e.getAttribute('id'),
          e.getAttribute('class'),
        ].join(' '),
      ) &&
      !e.closest(
        'main, article, aside, footer, [class*="customer"], [class*="partner"], [class*="testimonial"]',
      ),
  );
  const logoElement = headerLogo ?? explicitLogo;
  const logo =
    safeLink(structuredLogo, url) ??
    safeLink(
      logoElement?.getAttribute('data-src') || logoElement?.getAttribute('src'),
      url,
    );
  const name =
    string(organization?.name) ||
    meta['og:site_name'] ||
    meta['application-name'] ||
    null;
  const tagline =
    string(organization?.slogan) || clean(taglineElement?.textContent) || null;
  const description =
    meta.description ||
    meta['og:description'] ||
    string(organization?.description);
  const body = main?.textContent || document.documentElement?.textContent;
  return {
    url,
    title,
    name,
    tagline,
    logo,
    description,
    thumbnail,
    canonical,
    headings,
    h1,
    paragraphs,
    linkDetails: all('a[href]').flatMap((e) => {
      const link = safeLink(e.getAttribute('href'), url);
      return link
        ? [{ url: link, text: clean(e.textContent).slice(0, 200) }]
        : [];
    }),
    text: clean(body).slice(0, 20000),
    identity: {
      name: string(organization?.name)
        ? 'script[type="application/ld+json"] · Organization.name'
        : meta['og:site_name']
          ? 'meta[property="og:site_name"]'
          : 'meta[name="application-name"]',
      tagline: string(organization?.slogan)
        ? 'script[type="application/ld+json"] · Organization.slogan'
        : taglineElement
          ? selector(taglineElement)
          : '',
      logo: structuredLogo
        ? 'script[type="application/ld+json"] · Organization.logo'
        : logoElement
          ? selector(logoElement)
          : '',
    },
    links: [
      ...new Set(
        all('a[href]').flatMap(
          (e) => safeLink(e.getAttribute('href'), url) ?? [],
        ),
      ),
    ],
    stylesheets,
    css: css.join('\n'),
  };
}

export function plainText(html: string) {
  const { document } = parseHTML(`<div>${html}</div>`);
  document
    .querySelectorAll('script, style, template, noscript')
    .forEach((e) => e.remove());
  return clean(document.textContent || document.documentElement?.textContent);
}
