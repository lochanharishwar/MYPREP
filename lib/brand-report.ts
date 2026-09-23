import type { BrandDNA, Entity } from './contracts';
import { analyzeWebsiteDNA, type AnalysisPage } from './brand-analysis';

export function isUnverifiedDNA(dna: BrandDNA) {
  return dna.evidence.some((e) =>
    /synthesized|generated locally|Local Intelligence Profile/i.test(e.excerpt),
  );
}

export function retainBrandCorrections<T extends Omit<BrandDNA, 'brandId'>>(
  fresh: T,
  previous?: BrandDNA,
): T {
  if (!previous) return fresh;
  const result = {
    ...fresh,
    evidence: [...fresh.evidence],
    identityEvidence: { ...fresh.identityEvidence },
  };
  for (const key of ['name', 'tagline'] as const) {
    const userEvidence = previous.evidence.filter(
      (e) =>
        e.method === 'user' && previous.identityEvidence?.[key]?.includes(e.id),
    );
    if (!userEvidence.length) continue;
    result[key] = previous[key];
    result.identityEvidence[key] = userEvidence.map((e) => e.id);
    for (const e of userEvidence)
      if (!result.evidence.some((other) => other.id === e.id))
        result.evidence.push(e);
  }
  return result;
}

export function analyzeSavedPages(dna: BrandDNA, records: Entity[]): BrandDNA {
  if (isUnverifiedDNA(dna))
    throw new Error(
      'Scan this website again to replace the older unverified profile with source-backed findings.',
    );
  const pages: AnalysisPage[] = records
    .filter((r) => r.kind === 'page' && r.brand_id === dna.brandId)
    .slice(0, 30)
    .flatMap((record) => {
      const p = record.payload;
      if (p.observation)
        return [
          { observedAt: record.updated_at, ...(p.observation as AnalysisPage) },
        ];
      const summary = p.summary as
        | { summary?: string; headings?: string[] }
        | undefined;
      if (typeof p.url !== 'string' || !summary?.summary) return [];
      return [
        {
          url: p.url,
          observedAt: record.updated_at,
          title: typeof p.title === 'string' ? p.title : '',
          description: '',
          headings: summary.headings ?? [],
          copy: [
            {
              text: summary.summary,
              selector: 'Previously saved page summary',
            },
          ],
          links: [],
          method: 'research' as const,
          truncated: true,
        },
      ];
    });
  if (!pages.length)
    throw new Error(
      'Scan the website first to collect readable page evidence.',
    );
  const next = analyzeWebsiteDNA(
    { ...dna, version: Date.now(), createdAt: new Date().toISOString() },
    pages,
  );
  return retainBrandCorrections(next, dna);
}

export function jobsNeedResourceRefresh(rows: Entity[]) {
  return rows.some(
    (r) =>
      ['completed', 'qualified', 'published'].includes(
        String(r.payload.status),
      ) ||
      (r.kind === 'scan' &&
        ['complete', 'partial'].includes(String(r.payload.status))),
  );
}
