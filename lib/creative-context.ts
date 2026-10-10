import { z } from 'zod';
import type { BrandDNA, Finding } from './contracts';
import { brandPolicySchema } from './brand-policy';

const finding = z.object({
  text: z.string().max(2000),
  type: z
    .enum(['fact', 'interpretation', 'research', 'correction'])
    .default('interpretation'),
  evidenceIds: z.array(z.string().max(150)).max(40).default([]),
});
export const creativeBrandSchema = z.object({
  version: z.number().optional(),
  name: z.string().max(500).nullable(),
  tagline: z.string().max(1000).nullable(),
  overview: z.array(finding).max(12),
  values: z.array(finding).max(12).default([]),
  voice: z.array(finding).max(12).default([]),
  aesthetics: z.array(finding).max(12).default([]),
  palette: z.array(z.string().max(150)).max(30).default([]),
  fonts: z.array(z.string().max(200)).max(20).default([]),
  evidence: z
    .array(
      z.object({
        id: z.string().max(150),
        url: z.string().max(2000),
        excerpt: z.string().max(1200),
        observedAt: z.string().max(100),
        method: z.enum([
          'dom',
          'computed-style',
          'metadata',
          'vision',
          'research',
          'user',
        ]),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(200)
    .default([]),
  governance: brandPolicySchema.optional(),
});

// Send relevant creative evidence, not thousands of unrelated CSS declarations.
export function creativeBrandContext(dna: BrandDNA) {
  const compact = (items: Finding[]) =>
    items.slice(0, 12).map((f) => ({
      text: f.text.slice(0, 2000),
      type: f.type,
      evidenceIds: f.evidenceIds.slice(0, 40),
    }));
  const findings = {
    overview: compact(dna.overview),
    values: compact(dna.values),
    voice: compact(dna.voice),
    aesthetics: compact(dna.aesthetics),
  };
  const ids = new Set([
    ...Object.values(findings).flatMap((fs) =>
      fs.flatMap((f) => f.evidenceIds),
    ),
    ...Object.values(dna.identityEvidence ?? {}).flatMap((v) => v ?? []),
    ...(dna.governance?.approvedClaims.flatMap((c) => c.evidenceIds) ?? []),
  ]);
  const evidence = dna.evidence
    .filter((e) => ids.has(e.id))
    .slice(0, 200)
    .map((e) => ({ ...e, excerpt: e.excerpt.slice(0, 1200) }));
  const available = new Set(evidence.map((e) => e.id));
  for (const list of Object.values(findings))
    for (const f of list)
      f.evidenceIds = f.evidenceIds.filter((id) => available.has(id));
  return creativeBrandSchema.parse({
    version: dna.version,
    name: dna.name,
    tagline: dna.tagline,
    ...findings,
    palette: dna.palette.slice(0, 30),
    fonts: dna.fonts.slice(0, 20),
    evidence,
    governance: dna.governance,
  });
}
