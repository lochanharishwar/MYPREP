import type { BrandDNA, Finding } from './contracts';

export type BrandColorRole = 'primary' | 'secondary' | 'text';
export interface BrandColorCandidate {
  value: string;
  observations: BrandDNA['colors'];
}
export interface BrandIdentityColor {
  role: BrandColorRole;
  label: string;
  candidates: BrandColorCandidate[];
}

// CSS names are evidence of a possible role, not proof of the active theme or
// approved brand guidelines. In particular, palette order establishes no role.
const roleProperties: Record<BrandColorRole, Set<string>> = {
  primary: new Set([
    '--primary',
    '--primary-color',
    '--color-primary',
    '--brand',
    '--brand-color',
    '--color-brand',
    '--brand-primary',
    '--brand-primary-color',
    '--color-brand-primary',
  ]),
  secondary: new Set([
    '--secondary',
    '--secondary-color',
    '--color-secondary',
    '--brand-secondary',
    '--brand-secondary-color',
    '--color-brand-secondary',
  ]),
  text: new Set([
    '--text',
    '--text-color',
    '--color-text',
    '--foreground',
    '--color-foreground',
    '--body-color',
    '--body-text',
    '--body-text-color',
    '--text-primary',
    '--text-color-primary',
    '--color-text-primary',
    '--primary-text-color',
    '--brand-text',
    '--brand-text-color',
  ]),
};

function declarationParts(selector: string) {
  const split = selector.lastIndexOf('·');
  return split < 0
    ? { scope: selector.trim(), property: '' }
    : {
        scope: selector.slice(0, split).trim(),
        property: selector
          .slice(split + 1)
          .trim()
          .toLowerCase(),
      };
}

function isGlobalScope(scope: string) {
  return scope
    .split(',')
    .some((part) => /^(?:html|body|:root)$/.test(part.trim()));
}

export function getBrandIdentityColors(
  dna: Pick<BrandDNA, 'colors'>,
): BrandIdentityColor[] {
  return (['primary', 'secondary', 'text'] as const).map((role) => {
    const observations = dna.colors
      .filter((color) => {
        const { scope, property } = declarationParts(color.selector);
        return (
          color.value.trim() &&
          (roleProperties[role].has(property) ||
            (role === 'text' && property === 'color' && isGlobalScope(scope)))
        );
      })
      .sort((a, b) => {
        const rank = (color: BrandDNA['colors'][number]) => {
          const { scope, property } = declarationParts(color.selector);
          return (
            (isGlobalScope(scope) ? 2 : 0) +
            (role === 'text' && property === 'color' ? 1 : 0)
          );
        };
        return rank(b) - rank(a);
      });
    const byValue = new Map<string, BrandColorCandidate>();
    for (const observation of observations) {
      const key = observation.value.trim().toLowerCase();
      const candidate = byValue.get(key);
      if (candidate) candidate.observations.push(observation);
      else
        byValue.set(key, {
          value: observation.value,
          observations: [observation],
        });
    }
    return {
      role,
      label:
        role === 'primary'
          ? 'Primary'
          : role === 'secondary'
            ? 'Secondary'
            : 'Text',
      candidates: [...byValue.values()],
    };
  });
}

export function brandLogoUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function brandVoiceLabel(
  finding: Finding,
  dna: Pick<BrandDNA, 'evidence'>,
) {
  if (!finding.evidenceIds.some((id) => dna.evidence.some((e) => e.id === id)))
    return 'Saved finding · source unavailable';
  return finding.type === 'interpretation'
    ? 'Interpretation from website copy'
    : finding.type === 'correction'
      ? 'User correction'
      : finding.type === 'research'
        ? 'Research finding'
        : 'Website observation';
}
