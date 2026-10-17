// Conservative reservations for the bounded local generation path, not invoices.
// Source: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-10-17).
// 3.1 Pro text: (60,000 * $2 + 8,000 * $12) / 1M, plus 20%, rounded up.
// Legacy 2.5 Pro text: (60,000 * $1.25 + 8,000 * $10) / 1M, plus 20%.
// Image: (60,000 * $2 + 8,192 * $120) / 1M, plus 20%, rounded up.
// All image output tokens use the highest output tariff, including thoughts.
export const LOCAL_GENERATION_PRICING_VERSION = 'google-standard-2026-10-17';
export const LOCAL_GENERATION_INPUT_TOKENS = 60_000;
export const LOCAL_TEXT_OUTPUT_TOKENS = 8_000;
export const LOCAL_IMAGE_OUTPUT_TOKENS = 8_192;
export const LOCAL_TEXT_RESERVATION_USD = 0.26;
export const LOCAL_IMAGE_RESERVATION_USD = 1.33;

type CostSetting = string | number | null | undefined;
type CostInput = {
  textModel: string;
  reviewModel: string;
  imageModel: string;
  textCost?: CostSetting;
  imageCost?: CostSetting;
};

export type LocalGenerationCosts = {
  textCost: number | null;
  imageCost: number | null;
  textReady: boolean;
  imageReady: boolean;
  errors: string[];
  source: 'built-in' | 'configured' | 'mixed';
  pricingVersion: string;
};

function supplied(value: CostSetting) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function getLocalGenerationCosts(
  input: CostInput,
): LocalGenerationCosts {
  const errors: string[] = [];
  const resolve = (
    setting: CostSetting,
    models: string[],
    knownCosts: Record<string, number>,
    label: string,
  ) => {
    const known = models.every((model) => Object.hasOwn(knownCosts, model));
    const floor = Math.max(
      0,
      ...models.map((model) =>
        Object.hasOwn(knownCosts, model) ? knownCosts[model] : 0,
      ),
    );
    if (!supplied(setting)) {
      if (known) return floor;
      errors.push(
        `Set a conservative ${label} cost estimate for the configured model before creating content. Built-in estimates cover ${Object.keys(knownCosts).join(', ')} only.`,
      );
      return null;
    }
    const cost = Number(setting);
    if (!Number.isFinite(cost) || cost <= 0) {
      errors.push(
        `The ${label} cost estimate must be a positive, finite amount in USD.`,
      );
      return null;
    }
    // One text reserve covers either the caption or review model. A custom
    // model cannot lower the safe floor of the known model used alongside it.
    if (cost < floor) {
      errors.push(
        `The ${label} cost estimate must be at least $${floor.toFixed(2)} for the configured Gemini model.`,
      );
      return null;
    }
    return cost;
  };
  const textCost = resolve(
    input.textCost,
    [input.textModel, input.reviewModel],
    {
      'gemini-2.5-pro': 0.19,
      'gemini-3.1-pro-preview': LOCAL_TEXT_RESERVATION_USD,
    },
    'text and review',
  );
  const imageCost = resolve(
    input.imageCost,
    [input.imageModel],
    { 'gemini-3-pro-image': LOCAL_IMAGE_RESERVATION_USD },
    'image',
  );
  const explicitCount =
    Number(supplied(input.textCost)) + Number(supplied(input.imageCost));
  return {
    textCost,
    imageCost,
    textReady: textCost !== null,
    imageReady: textCost !== null && imageCost !== null,
    errors,
    source:
      explicitCount === 0
        ? 'built-in'
        : explicitCount === 2
          ? 'configured'
          : 'mixed',
    pricingVersion: LOCAL_GENERATION_PRICING_VERSION,
  };
}
