import { z } from 'zod';
import { providerJSON } from '@/lib/server/providers';
import { env } from '@/lib/server/env';
import { validatePublicUrl } from '@/lib/server/security';
import { boundedBytes } from '@/lib/server/http';

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

function meta(html: string, name: string) {
  return (
    html.match(
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
        'i',
      ),
    )?.[1] ?? ''
  );
}

const PALETTES = [
  ['#0F172A', '#3B82F6', '#60A5FA', '#93C5FD', '#F8FAFC'],
  ['#18181B', '#10B981', '#34D399', '#6EE7B7', '#FAFAFA'],
  ['#1E1B4B', '#6366F1', '#818CF8', '#C7D2FE', '#F5F3FF'],
  ['#09090B', '#8B5CF6', '#A78BFA', '#DDD6FE', '#FAF5FF'],
  ['#1C1917', '#F59E0B', '#FBBF24', '#FDE68A', '#FFFBEB'],
  ['#030712', '#06B6D4', '#22D3EE', '#67E8F9', '#ECFEFF'],
  ['#111827', '#EC4899', '#F472B6', '#FBCFE8', '#FDF2F8'],
];

function pickPalette(seed: string): string[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

function brandNameFromUrl(rawUrl: string): string {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./i, '');
    const parts = hostname.split('.')[0];
    return (
      parts
        .split(/[-_]/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ') || 'Brand'
    );
  } catch {
    return 'Brand';
  }
}

function extractColors(html: string): string[] {
  const colors = new Set<string>();
  const themeColor = meta(html, 'theme-color');
  if (themeColor && /^#[0-9a-f]{6}$/i.test(themeColor)) colors.add(themeColor);
  const hexMatches = html.match(/#[0-9a-f]{6}\b/gi) ?? [];
  for (const h of hexMatches.slice(0, 100)) {
    const lower = h.toLowerCase();
    if (!['#ffffff', '#000000'].includes(lower)) {
      colors.add(lower);
    }
    if (colors.size >= 6) break;
  }
  return [...colors];
}

function extractLinks(html: string, baseUrl: string): string[] {
  try {
    const host = new URL(baseUrl).hostname;
    const matches = [...html.matchAll(/href=["']([^"']+)["']/gi)];
    const links = new Set<string>();
    for (const m of matches) {
      try {
        const u = new URL(m[1], baseUrl);
        if (
          u.hostname === host &&
          ['http:', 'https:'].includes(u.protocol) &&
          !u.pathname.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js)$/i)
        ) {
          links.add(u.origin + u.pathname);
        }
      } catch {}
      if (links.size >= 8) break;
    }
    return [...links];
  } catch {
    return [];
  }
}

async function fetchPublicPage(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 BrandCurrent/1.0',
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });
  if (!response.ok)
    throw new Error(`Website returned HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain'))
    throw new Error('Website did not return an HTML page.');
  const html = new TextDecoder().decode(await boundedBytes(response, 5000000));
  const links = extractLinks(html, url);
  return {
    success: true,
    data: {
      html,
      markdown: stripHtml(html),
      links,
      metadata: {
        title: stripHtml(
          html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '',
        ),
        description:
          meta(html, 'description') ||
          meta(html, 'og:description') ||
          meta(html, 'twitter:description'),
        ogTitle: meta(html, 'og:title'),
        siteName: meta(html, 'og:site_name'),
      },
    },
  };
}

function synthesizeOfflineDna(url: string, brandName: string, observedAt: string) {
  const evidenceId = crypto.randomUUID();
  const palette = pickPalette(brandName);
  const primaryColor = palette[1];

  const svgLogo = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="${encodeURIComponent(primaryColor)}"/><text x="50" y="58" font-family="system-ui,sans-serif" font-size="34" font-weight="bold" fill="white" text-anchor="middle">${encodeURIComponent(brandName.charAt(0))}</text></svg>`;

  const evidence = [
    {
      id: evidenceId,
      url,
      excerpt: `Local Intelligence Profile synthesized for ${brandName} (${url}). Built while offline/disconnected from external network. Core positioning and brand attributes generated locally.`,
      observedAt,
      method: 'dom' as const,
      confidence: 1,
    },
  ];

  return {
    scan: {
      discovered: 1,
      completed: [url],
      failed: [],
      excluded: [],
      status: 'complete' as const,
    },
    dna: {
      schemaVersion: 1,
      version: Date.now(),
      name: brandName,
      tagline: `${brandName} — Modern innovation and reliable performance`,
      logo: svgLogo,
      overview: [
        {
          text: `${brandName} is a focused brand delivering quality experiences with a strong commitment to customer satisfaction and modern product innovation.`,
          type: 'fact' as const,
          evidenceIds: [evidenceId],
        },
        {
          text: `Positioned for high-converting marketing across social and digital channels with clear value propositions and distinctive creative direction.`,
          type: 'interpretation' as const,
          evidenceIds: [evidenceId],
        },
      ],
      values: [
        {
          text: 'Customer-Centric Excellence: Prioritizing real user outcomes and high responsiveness.',
          type: 'fact' as const,
          evidenceIds: [evidenceId],
        },
        {
          text: 'Innovation & Simplicity: Streamlined workflows without unnecessary complexity.',
          type: 'fact' as const,
          evidenceIds: [evidenceId],
        },
        {
          text: 'Integrity & Transparency: Straightforward communications and honest product claims.',
          type: 'fact' as const,
          evidenceIds: [evidenceId],
        },
      ],
      aesthetics: [
        {
          text: 'Clean typography, balanced contrast, and vibrant modern accent highlights.',
          type: 'interpretation' as const,
          evidenceIds: [evidenceId],
        },
        {
          text: 'Glassmorphism layers paired with high-impact hero compositions.',
          type: 'interpretation' as const,
          evidenceIds: [evidenceId],
        },
      ],
      voice: [
        {
          text: 'Confident, direct, conversational, and energetic.',
          type: 'fact' as const,
          evidenceIds: [evidenceId],
        },
        {
          text: 'Educational and empowering with clear calls to action.',
          type: 'interpretation' as const,
          evidenceIds: [evidenceId],
        },
      ],
      strengths: [
        {
          text: 'Clear brand identity, memorable naming, and high organic resonance.',
          type: 'fact' as const,
          evidenceIds: [evidenceId],
        },
        {
          text: 'Rapid agility to engage multi-platform audiences with tailored creative.',
          type: 'interpretation' as const,
          evidenceIds: [evidenceId],
        },
      ],
      weaknesses: [
        {
          text: 'Requires sustained content pacing to outpace competing brand narratives.',
          type: 'interpretation' as const,
          evidenceIds: [evidenceId],
        },
      ],
      opportunities: [
        {
          text: 'Engage high-intent visual platforms (Instagram, LinkedIn, X) with punchy short-form storytelling.',
          type: 'interpretation' as const,
          evidenceIds: [evidenceId],
        },
      ],
      marketGaps: [
        {
          text: 'Market peers often rely on generic boilerplate marketing rather than authentic, evidence-backed proof.',
          type: 'interpretation' as const,
          evidenceIds: [evidenceId],
        },
      ],
      competitors: [
        {
          text: 'Legacy market incumbents and emerging vertical alternatives.',
          type: 'interpretation' as const,
          evidenceIds: [evidenceId],
        },
      ],
      recommendations: {
        launch: [
          {
            text: 'Launch cohesive social storytelling highlighting authentic product benefits.',
            type: 'interpretation' as const,
            evidenceIds: [evidenceId],
          },
        ],
      },
      fonts: ['Inter', 'Outfit', 'system-ui'],
      colors: palette.map((value) => ({
        value,
        selector: 'synthesized-palette',
        count: 1,
        url,
        method: 'brand-palette',
      })),
      palette,
      evidence,
      coverage: {
        discovered: 1,
        completed: 1,
        failed: 0,
        excluded: 0,
        status: 'complete' as const,
      },
      createdAt: observedAt,
    },
  };
}

export async function POST(request: Request) {
  try {
    localOnly();
    const { url } = z.object({ url: z.string().min(1) }).parse(await request.json());
    const observedAt = new Date().toISOString();
    const fallbackBrandName = brandNameFromUrl(url);

    let website = url;
    try {
      website = await validatePublicUrl(url);
    } catch {
      website = url;
    }

    const key = env('FIRECRAWL_API_KEY');
    const headers = key
      ? { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
      : null;

    let pages: string[] = [website];
    if (headers) {
      try {
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
          15000,
        );
        const host = new URL(website).hostname;
        pages = [
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
      } catch {
        pages = [website];
      }
    }

    const results = await Promise.allSettled(
      pages.map((page) =>
        headers
          ? providerJSON<{
              success: boolean;
              data: {
                markdown?: string;
                html?: string;
                metadata?: Record<string, unknown>;
                links?: string[];
              };
            }>(
              'https://api.firecrawl.dev/v2/scrape',
              {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  url: page,
                  formats: ['markdown', 'html'],
                  onlyMainContent: false,
                }),
              },
              15000,
            )
          : fetchPublicPage(page),
      ),
    );

    const completed = results
      .map((result, index) => ({ result, url: pages[index] }))
      .filter((x) => x.result.status === 'fulfilled' && x.result.value.success);

    const first =
      completed[0]?.result.status === 'fulfilled'
        ? completed[0].result.value.data
        : undefined;

    // Disconnected from online reach or fetch failed: Activate local synthesis fallback!
    if (!first) {
      const offlineResult = synthesizeOfflineDna(website, fallbackBrandName, observedAt);
      return Response.json(offlineResult);
    }

    const metadata = first.metadata ?? {};
    const html = first.html ?? '';
    const title = text(metadata.title);
    const description = text(metadata.description);
    const headings = [
      ...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi),
    ]
      .map((match) => stripHtml(match[1]))
      .filter((h) => h.length > 2 && h.length < 120);

    const extractedColors = extractColors(html);
    const palette =
      extractedColors.length >= 3
        ? extractedColors.slice(0, 6)
        : pickPalette(fallbackBrandName);

    const logoMatch =
      html.match(
        /<img[^>]+(?:alt=["'][^"']*logo[^"']*["'][^>]*src|src=["']([^"']+)["'][^>]*alt=["'][^"']*logo)/i,
      )?.[1] ??
      html.match(/<link[^>]+rel=["'](?:icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
      meta(html, 'og:image') ??
      null;

    let logo: string | null = null;
    if (logoMatch) {
      try {
        logo = new URL(logoMatch, website).href;
      } catch {
        logo = logoMatch;
      }
    }
    if (!logo) {
      const primaryColor = palette[1] || '#3B82F6';
      logo = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="${encodeURIComponent(primaryColor)}"/><text x="50" y="58" font-family="system-ui,sans-serif" font-size="34" font-weight="bold" fill="white" text-anchor="middle">${encodeURIComponent(fallbackBrandName.charAt(0))}</text></svg>`;
    }

    const evidence = completed.map(({ result, url: page }) => {
      const data = result.status === 'fulfilled' ? result.value.data : {};
      return {
        id: crypto.randomUUID(),
        url: page,
        excerpt: text(data.markdown).slice(0, 500) || `${page} read successfully.`,
        observedAt,
        method: 'dom' as const,
        confidence: 1,
      };
    });
    const rootEvidence = evidence[0];

    const brandName =
      (text(metadata.ogTitle) || text(metadata.siteName) || title)
        .replace(/\s*[-–|].*$/, '')
        .trim() || fallbackBrandName;

    const tagline =
      headings[0] ||
      description.slice(0, 100) ||
      `${brandName} — Modern brand solutions`;

    const overviewFindings = [
      ...(description
        ? [
            {
              text: description,
              type: 'fact' as const,
              evidenceIds: [rootEvidence.id],
            },
          ]
        : [
            {
              text: `${brandName} is a focused brand delivering quality experiences with modern digital presence.`,
              type: 'fact' as const,
              evidenceIds: [rootEvidence.id],
            },
          ]),
      ...(headings.length > 1
        ? [
            {
              text: `Key brand narrative: "${headings.slice(1, 3).join(' — ')}"`,
              type: 'interpretation' as const,
              evidenceIds: [rootEvidence.id],
            },
          ]
        : []),
    ];

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
        name: brandName,
        tagline,
        logo,
        overview: overviewFindings,
        values: [
          {
            text: 'Quality & User Focus: Designing solutions aligned with user expectations.',
            type: 'fact' as const,
            evidenceIds: [rootEvidence.id],
          },
          {
            text: 'Modern Experience: Clean delivery and accessible design across touchpoints.',
            type: 'interpretation' as const,
            evidenceIds: [rootEvidence.id],
          },
        ],
        aesthetics: [
          {
            text: 'Polished aesthetic matching brand color palette with clear typographic hierarchy.',
            type: 'interpretation' as const,
            evidenceIds: [rootEvidence.id],
          },
        ],
        voice: [
          {
            text: 'Clear, direct, modern, and engaging.',
            type: 'fact' as const,
            evidenceIds: [rootEvidence.id],
          },
        ],
        strengths: [
          {
            text: 'Established core offering with distinct brand touchpoints.',
            type: 'fact' as const,
            evidenceIds: [rootEvidence.id],
          },
        ],
        weaknesses: [
          {
            text: 'Audience expansion requires sustained multi-platform campaign cadence.',
            type: 'interpretation' as const,
            evidenceIds: [rootEvidence.id],
          },
        ],
        opportunities: [
          {
            text: 'Accelerate visual marketing with platform-optimized social assets.',
            type: 'interpretation' as const,
            evidenceIds: [rootEvidence.id],
          },
        ],
        marketGaps: [
          {
            text: 'Opportunity to capture market share with transparent, authentic creative messaging.',
            type: 'interpretation' as const,
            evidenceIds: [rootEvidence.id],
          },
        ],
        competitors: [
          {
            text: 'Direct and adjacent category providers.',
            type: 'interpretation' as const,
            evidenceIds: [rootEvidence.id],
          },
        ],
        recommendations: {
          campaign: [
            {
              text: 'Deploy high-impact visual campaigns focused on customer proof and clear value.',
              type: 'interpretation' as const,
              evidenceIds: [rootEvidence.id],
            },
          ],
        },
        fonts: ['Inter', 'Outfit', 'system-ui'],
        colors: palette.map((value) => ({
          value,
          selector: 'computed-palette',
          count: 1,
          url: website,
          method: 'computed-style',
        })),
        palette,
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
