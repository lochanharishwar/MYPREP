import { z } from 'zod';
export const brandPolicySchema = z.object({
  assetIds: z.array(z.uuid()).max(10).default([]),
  approvedClaims: z
    .array(
      z.object({
        text: z.string().min(1).max(1000),
        evidenceIds: z.array(z.string()).min(1),
      }),
    )
    .max(100)
    .default([]),
  forbiddenClaims: z.array(z.string().min(1).max(300)).max(100).default([]),
  disclaimers: z.array(z.string().min(1).max(500)).max(20).default([]),
  palette: z
    .array(z.string().regex(/^#[a-f0-9]{6}$/i))
    .max(30)
    .default([]),
  fonts: z.array(z.string().min(1).max(100)).max(20).default([]),
  toneRules: z.string().max(3000).default(''),
  language: z.string().max(100).default('English'),
  market: z.string().max(100).default('India'),
  visualDirection: z
    .string()
    .max(2000)
    .default(
      'Realistic product-use scenes; an adult Indian woman where relevant to the brief; keep the product central.',
    ),
  rightsNotes: z.string().max(3000).default(''),
  rightsExpireAt: z.iso.datetime({ offset: true }).nullable().default(null),
});
export type BrandPolicy = z.infer<typeof brandPolicySchema> & {
  approvedBy?: string;
  approvedAt?: string;
  version: number;
};
export function checkBrandCopy(caption: string, policy?: BrandPolicy) {
  if (!policy?.approvedBy)
    throw new Error(
      'An owner must approve this Brand DNA version before creative work.',
    );
  if (policy.rightsExpireAt && Date.parse(policy.rightsExpireAt) <= Date.now())
    throw new Error(
      'Brand usage rights expired. Request a new approved Brand DNA version.',
    );
  const normalized = caption.normalize('NFKC').toLowerCase();
  for (const phrase of policy.forbiddenClaims)
    if (normalized.includes(phrase.normalize('NFKC').toLowerCase()))
      throw new Error(`Forbidden claim: ${phrase}`);
  for (const phrase of policy.disclaimers)
    if (!normalized.includes(phrase.normalize('NFKC').toLowerCase()))
      throw new Error(`Required disclaimer missing: ${phrase}`);
}
export const AI_VERSIONS = {
  generationPrompt: 'creative-2',
  reviewPrompt: 'finished-media-2',
  rubric: 'weighted-35-25-20-20-v1',
  policy: 'brand-policy-1',
} as const;
