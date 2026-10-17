import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BrandDNA } from '@/lib/contracts';
import { brandLogoUrl, getBrandIdentityColors } from '@/lib/brand-identity';
import { BrandIdentitySummary } from '@/components/brand-identity';
import { observedStyles } from '@/lib/server/local-crawl';

const dna: BrandDNA = {
  schemaVersion: 1,
  version: 1,
  brandId: 'brand',
  name: 'Daybreak',
  tagline: null,
  logo: null,
  overview: [],
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
  evidence: [],
  coverage: {
    completed: 1,
    discovered: 1,
    failed: 0,
    excluded: 0,
    status: 'complete',
  },
  createdAt: '2026-10-17T00:00:00Z',
};

describe('Brand identity color evidence', () => {
  it('uses observed declaration roles and does not assign palette positions to roles', () => {
    const styles = observedStyles(
      ':root { --secondary: #8ebccc; --primary: #ffcc55; } body { color: #17222c; background-color: #ffffff; }',
      'https://example.com/styles.css',
    );
    const roles = getBrandIdentityColors({ ...dna, colors: styles.colors });
    expect(roles.map((role) => [role.role, role.candidates[0]?.value])).toEqual(
      [
        ['primary', '#ffcc55'],
        ['secondary', '#8ebccc'],
        ['text', '#17222c'],
      ],
    );
    expect(roles[2].candidates[0].observations[0].selector).toBe(
      'body · color',
    );
  });

  it('leaves unknown roles empty despite palette entries or unrelated CSS names', () => {
    const colors = observedStyles(
      ':root { --primary-foreground: #fff; --secondary-hover: #222; --brand-shadow: #333; --text-muted: #444; } .primary { background: #555; } .card { color: #666; }',
      'https://example.com/styles.css',
    ).colors;
    const profile = {
      ...dna,
      colors,
      palette: ['#ff0000', '#00ff00', '#0000ff'],
    };
    expect(
      getBrandIdentityColors(profile).every(
        (role) => role.candidates.length === 0,
      ),
    ).toBe(true);
    const markup = renderToStaticMarkup(
      createElement(BrandIdentitySummary, { dna: profile }),
    );
    expect(markup.match(/Not identified/g)).toHaveLength(3);
    expect(markup).not.toContain('#ff0000');
    expect(markup).not.toContain('Verified');
  });

  it('keeps theme alternatives and duplicate observations inspectable', () => {
    const colors = observedStyles(
      '.dark { --primary: #123456; } :root { --primary: #abcdef; --primary-color: #abcdef; }',
      'https://example.com/theme.css',
    ).colors;
    const primary = getBrandIdentityColors({ colors })[0];
    expect(primary.candidates.map((candidate) => candidate.value)).toEqual([
      '#abcdef',
      '#123456',
    ]);
    expect(primary.candidates[0].observations).toHaveLength(2);
    const markup = renderToStaticMarkup(
      createElement(BrandIdentitySummary, { dna: { ...dna, colors } }),
    );
    expect(markup).toContain('CSS candidate');
    expect(markup).toContain(
      'active theme and approved brand role need confirmation',
    );
    expect(markup).toContain('https://example.com/theme.css');
    expect(markup).toContain('.dark · --primary');
  });

  it('prefers the observed body text color over local token declarations', () => {
    const colors = observedStyles(
      '.card { --text: #112233; } body { color: #aabbcc; } :root { --foreground: #445566; }',
      'https://example.com/styles.css',
    ).colors;
    const text = getBrandIdentityColors({ colors })[2];
    expect(text.candidates[0].value).toBe('#aabbcc');
    expect(text.candidates.map((candidate) => candidate.value)).toEqual([
      '#aabbcc',
      '#445566',
      '#112233',
    ]);
  });
});

describe('Brand identity summary', () => {
  it('shows the exact saved motto and existing voice without rewriting them', () => {
    const tagline = 'Make room. For what matters.™';
    const profile: BrandDNA = {
      ...dna,
      tagline,
      voice: [
        {
          title: 'Direct reader address',
          text: 'The sampled copy addresses the reader directly.',
          type: 'interpretation',
          evidenceIds: ['voice-source'],
        },
      ],
      evidence: [
        {
          id: 'voice-source',
          url: 'https://example.com',
          excerpt: 'Your next chapter starts here.',
          method: 'dom',
          confidence: 1,
          observedAt: dna.createdAt,
        },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(BrandIdentitySummary, { dna: profile }),
    );
    expect(markup).toContain(tagline);
    expect(markup).toContain('Direct reader address');
    expect(markup).toContain('The sampled copy addresses the reader directly.');
    expect(markup).toContain('Interpretation from website copy');
    expect(markup).toContain('Inspect voice');
    expect(markup).toContain('Your next chapter starts here.');
    expect(markup).not.toContain('Friendly');
  });

  it('states missing identity details and missing voice evidence honestly', () => {
    const markup = renderToStaticMarkup(
      createElement(BrandIdentitySummary, { dna }),
    );
    expect(markup).toContain('Logo not found');
    expect(markup).toContain('No explicit motto or tagline found');
    expect(markup).toContain('Tone not yet identified');
    const unsourced = renderToStaticMarkup(
      createElement(BrandIdentitySummary, {
        dna: {
          ...dna,
          voice: [
            {
              title: 'Legacy finding',
              text: 'A saved description.',
              type: 'fact',
              evidenceIds: ['missing'],
            },
          ],
        },
      }),
    );
    expect(unsourced).toContain('Saved finding · source unavailable');
    expect(unsourced).not.toContain('Website observation');
  });

  it('offers both logo surfaces and rejects invalid image addresses', () => {
    const markup = renderToStaticMarkup(
      createElement(BrandIdentitySummary, {
        dna: { ...dna, logo: 'https://example.com/logo-transparent.svg' },
      }),
    );
    expect(markup).toContain('Daybreak logo');
    expect(markup).toContain('Preview logo on light background');
    expect(markup).toContain('Preview logo on dark background');
    expect(brandLogoUrl('https://example.com/logo.svg')).toBe(
      'https://example.com/logo.svg',
    );
    expect(brandLogoUrl('https:')).toBeNull();
    expect(brandLogoUrl('javascript:alert(1)')).toBeNull();
    expect(brandLogoUrl(null)).toBeNull();
  });
});
