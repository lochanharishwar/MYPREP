import { describe, it, expect } from 'vitest';
import type { BrandDNA, Entity, Finding } from '@/lib/contracts';
import { analyzeWebsiteDNA, type AnalysisPage } from '@/lib/brand-analysis';
import {
  analyzeSavedPages,
  retainBrandCorrections,
  jobsNeedResourceRefresh,
} from '@/lib/brand-report';
import { observedStyles, parsePage } from '@/lib/server/local-crawl';
const rowBase = {
  id: 'row',
  workspace_id: 'workspace',
  brand_id: 'a',
  created_at: '2026-09-22',
  updated_at: '2026-09-22',
};

const dna: BrandDNA = {
  schemaVersion: 1,
  version: 1,
  brandId: 'a',
  name: 'Cycle',
  tagline: null,
  logo: null,
  overview: [],
  values: [],
  voice: [],
  aesthetics: [],
  strengths: [],
  weaknesses: [],
  opportunities: [],
  marketGaps: [],
  competitors: [],
  recommendations: {},
  fonts: [],
  colors: [],
  palette: [],
  evidence: [],
  coverage: {
    completed: 1,
    discovered: 1,
    failed: 0,
    excluded: 0,
    status: 'partial',
  },
  createdAt: '2026-09-22T00:00:00Z',
};
const page: AnalysisPage = {
  url: 'https://example.com',
  title: 'Cycle',
  description: 'We build durable bicycles for your everyday city commute.',
  headings: ['Our values'],
  copy: [
    {
      text: 'We believe in making everyday travel easier with repairable products.',
      selector: '#mission',
      heading: 'Our values',
    },
  ],
  links: [],
  method: 'dom',
  truncated: false,
};

describe('Source-backed website analysis', () => {
  it('does not mistake contact copy or plan comparisons for brand voice or competitors', () => {
    const result = analyzeWebsiteDNA(dna, [
      {
        ...page,
        copy: [
          {
            text: 'Contact us: Email us for product support and further information.',
            selector: 'p',
          },
          {
            text: 'Compare our pricing plans and choose the features you need.',
            selector: 'p',
          },
        ],
      },
    ]);
    expect(result.competitors).toEqual([]);
    expect(result.voice.some((f) => f.text.includes('Contact us'))).toBe(false);
  });
  it('does not promote product taglines or quotations to brand identity', () => {
    const html =
      '<body><main><p class="tagline">A bigger display for more work.</p><p class="tagline">The smaller travel companion.</p><blockquote><p>Our team loves these products and will buy again.</p></blockquote><li><h2>Product red blue green</h2><p>Our actual product description has enough words to be useful.</p></li></main></body>';
    const result = parsePage(html, page.url);
    expect(result.tagline).toBeNull();
    expect(
      result.paragraphs.some((p) => p.text.includes('Our team loves')),
    ).toBe(false);
    expect(
      result.paragraphs.some((p) => p.text.includes('Product red blue')),
    ).toBe(false);
    expect(
      parsePage(
        '<p class="tagline">A bigger display for more work.</p>',
        page.url + '/products/display/',
      ).tagline,
    ).toBeNull();
  });
  it('creates useful findings with resolvable sources and explicitly unverified hypotheses', () => {
    const result = analyzeWebsiteDNA(dna, [page]);
    expect(result.strengths[0].text).toContain('bicycles');
    expect(result.values[0].text).toContain('repairable');
    expect(result.voice.length).toBeGreaterThan(0);
    expect(result.opportunities[0].hypothesis).toBeTruthy();
    expect(result.marketGaps[0].text).toContain(
      'not proof of unmet market demand',
    );
    expect(result.recommendations.instagram).toBeTruthy();
    const findings: Finding[] = [
      ...result.values,
      ...result.voice,
      ...result.strengths,
      ...result.weaknesses,
      ...result.opportunities,
      ...result.marketGaps,
      ...Object.values(result.recommendations).flat(),
    ];
    for (const finding of findings) {
      expect(finding.evidenceIds.length).toBeGreaterThan(0);
      expect(
        finding.evidenceIds.every((id) =>
          result.evidence.some((e) => e.id === id),
        ),
      ).toBe(true);
    }
    expect(dna.evidence).toEqual([]);
  });
  it('does not invent values, competitors, or advantages without evidence', () => {
    const empty = analyzeWebsiteDNA(dna, []);
    expect(empty.strengths).toEqual([]);
    expect(empty.values).toEqual([]);
    expect(empty.competitors).toEqual([]);
    expect(empty.analysis?.missing.competitors).toContain(
      'independent sources',
    );
    const result = analyzeWebsiteDNA(dna, [
      {
        ...page,
        copy: [],
        links: [{ url: 'https://google.com', text: 'Login with Google' }],
      },
    ]);
    expect(result.competitors).toEqual([]);
    expect(result.values).toEqual([]);
  });
  it('does not report absent metadata on partial or reader-derived HTML', () => {
    const result = analyzeWebsiteDNA(dna, [
      { ...page, title: '', description: '', truncated: true },
    ]);
    expect(
      result.weaknesses.some((f) => f.title === 'A search presentation gap'),
    ).toBe(false);
    const direct = analyzeWebsiteDNA(dna, [
      { ...page, title: '', description: '' },
    ]);
    expect(
      direct.weaknesses.some((f) => f.title === 'A search presentation gap'),
    ).toBe(true);
  });
  it('retains user corrections and points at their evidence after a rescan', () => {
    const corrected = {
      ...dna,
      name: 'My corrected brand',
      identityEvidence: { name: ['user-name'] },
      evidence: [
        {
          id: 'user-name',
          url: 'user:correction',
          excerpt: 'My corrected brand',
          method: 'user' as const,
          confidence: 1,
          observedAt: dna.createdAt,
        },
      ],
    };
    const result = retainBrandCorrections(
      { ...dna, name: 'Scraped name' },
      corrected,
    );
    expect(result.name).toBe('My corrected brand');
    expect(result.identityEvidence?.name).toEqual(['user-name']);
    expect(result.evidence.find((e) => e.id === 'user-name')?.method).toBe(
      'user',
    );
  });
  it('analyzes saved pages only for the selected brand without a network request', () => {
    const record = (brand: string, text: string) =>
      ({
        ...rowBase,
        kind: 'page',
        brand_id: brand,
        payload: {
          url: page.url,
          summary: { summary: text },
        },
      }) as Entity;
    const result = analyzeSavedPages(dna, [
      record('a', page.description),
      record('other', 'Different private company and its secrets'),
    ]);
    expect(result.strengths[0].text).toContain('bicycles');
    expect(JSON.stringify(result)).not.toContain('Different private company');
  });
  it('refreshes resource snapshots at real scan terminal states', () => {
    for (const status of ['complete', 'partial'])
      expect(
        jobsNeedResourceRefresh([
          { ...rowBase, kind: 'scan', payload: { status } } as Entity,
        ]),
      ).toBe(true);
    expect(
      jobsNeedResourceRefresh([
        { ...rowBase, kind: 'scan', payload: { status: 'running' } } as Entity,
      ]),
    ).toBe(false);
  });
  it('reads global fonts under media rules and avoids descendant demo font declarations', () => {
    const styles = observedStyles(
      ':root{--font-main:Inter,sans-serif} @media(min-width:1px){body{font-family:var(--font-main)}} body .demo{font-family:Fake} .mask{mask:url(#fff)}',
      page.url,
    );
    expect(styles.fonts).toEqual(['Inter,sans-serif']);
    expect(styles.colors).toEqual([]);
  });
  it('prefers explicit first-party organizations and reads value lists without cookie notices', () => {
    const observed = parsePage(
      `<script type="application/ld+json">[{"@type":"Organization","name":"Unknown publisher"},{"@type":"Organization","name":"Actual","url":"https://example.com"}]</script><body><main><section><h2>Our values</h2><ul><li>We believe in repairable products and long-term customer support.</li></ul></section><div class="cookie"><p>We value your privacy. Accept our cookies to continue browsing.</p></div></main></body>`,
      page.url,
    );
    expect(observed.name).toBe('Actual');
    expect(observed.paragraphs).toEqual([
      {
        text: 'We believe in repairable products and long-term customer support.',
        selector: 'li',
        heading: 'Our values',
      },
    ]);
  });
});
