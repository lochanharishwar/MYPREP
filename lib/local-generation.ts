import type { Platform } from './contracts';

export type LocalGenerationConfig = {
  ready: boolean;
  providerConfigured: boolean;
  reason: string;
  textCost: number | null;
  imageCost: number | null;
  textReady: boolean;
  imageReady: boolean;
  errors: string[];
  model: string;
  reviewModel: string;
  imageModel: string;
  pricingVersion: string;
};

const supported: Record<Platform, string[]> = {
  instagram: ['image'],
  youtube: [],
  x: ['text', 'image'],
  linkedin: ['text', 'image'],
  reddit: ['text', 'image'],
};

export function localGenerationPairs(platforms: string[], formats: string[]) {
  return [...new Set(platforms)].flatMap((platform) =>
    [...new Set(formats)]
      .filter((format) => supported[platform as Platform]?.includes(format))
      .map((format) => ({ platform, format })),
  );
}

export function localAttemptReserve(
  format: string,
  costs: Pick<LocalGenerationConfig, 'textCost' | 'imageCost'>,
) {
  const valid = (value: number | null): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (!valid(costs.textCost) || (format === 'image' && !valid(costs.imageCost)))
    return null;
  // Each version needs finished copy and a review, plus its selected media.
  const cost = 2 * costs.textCost + (format === 'image' ? costs.imageCost! : 0);
  return Math.ceil(cost * 100 - 1e-9) / 100;
}

export function localCampaignReserve(
  platforms: string[],
  formats: string[],
  costs: Pick<LocalGenerationConfig, 'textCost' | 'imageCost'>,
) {
  const pairs = localGenerationPairs(platforms, formats);
  const amounts = pairs.map((pair) => localAttemptReserve(pair.format, costs));
  if (!pairs.length || amounts.some((amount) => amount === null)) return null;
  const firstPass =
    amounts.reduce<number>((sum, amount) => sum + amount! * 100, 0) / 100;
  return {
    variants: pairs.length,
    firstPass,
    fullRun: Math.round(firstPass * 500) / 100,
  };
}
