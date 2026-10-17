import { describe, expect, it } from 'vitest';
import { getLocalGenerationCosts } from '../lib/generation-costs';

const defaults = {
  textModel: 'gemini-2.5-pro',
  reviewModel: 'gemini-2.5-pro',
  imageModel: 'gemini-3-pro-image',
};

describe('bounded local generation reservations', () => {
  it('supports the replacement model and reserves the higher cost for mixed models', () => {
    for (const textModel of ['gemini-2.5-pro', 'gemini-3.1-pro-preview']) {
      const input = {
        ...defaults,
        textModel,
        reviewModel: 'gemini-3.1-pro-preview',
      };
      expect(getLocalGenerationCosts(input)).toMatchObject({
        textCost: 0.26,
        imageCost: 1.33,
        textReady: true,
        imageReady: true,
        errors: [],
      });
      expect(
        getLocalGenerationCosts({ ...input, textCost: 0.25 }).textReady,
      ).toBe(false);
    }
  });

  it('supplies conservative estimates for the exact supported defaults', () => {
    expect(getLocalGenerationCosts(defaults)).toMatchObject({
      textCost: 0.19,
      imageCost: 1.33,
      textReady: true,
      imageReady: true,
      source: 'built-in',
      errors: [],
    });
    expect(
      getLocalGenerationCosts({ ...defaults, textCost: '', imageCost: ' ' })
        .textReady,
    ).toBe(true);
  });

  it('accepts higher explicit estimates and reports their source', () => {
    expect(
      getLocalGenerationCosts({ ...defaults, textCost: '0.25', imageCost: 2 }),
    ).toMatchObject({
      textCost: 0.25,
      imageCost: 2,
      source: 'configured',
      errors: [],
    });
    expect(getLocalGenerationCosts({ ...defaults, textCost: 0.3 }).source).toBe(
      'mixed',
    );
  });

  it.each([0, -1, NaN, Infinity, 'not a number', 'Infinity'])(
    'rejects invalid configured amounts: %s',
    (value) => {
      const result = getLocalGenerationCosts({
        ...defaults,
        textCost: value,
        imageCost: value,
      });
      expect(result.textReady).toBe(false);
      expect(result.imageReady).toBe(false);
      expect(result.errors).toHaveLength(2);
    },
  );

  it('cannot lower the verified floor for either default model', () => {
    const result = getLocalGenerationCosts({
      ...defaults,
      textCost: 0.18,
      imageCost: 1.32,
    });
    expect(result.textCost).toBeNull();
    expect(result.imageCost).toBeNull();
    expect(result.errors.join(' ')).toContain('$0.19');
    expect(result.errors.join(' ')).toContain('$1.33');
  });

  it('requires explicit prices for unknown models and exact-name variants', () => {
    const result = getLocalGenerationCosts({
      ...defaults,
      reviewModel: 'gemini-2.5-pro-preview',
      imageModel: 'gemini-3-pro-image-preview',
    });
    expect(result.textReady).toBe(false);
    expect(result.imageReady).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(
      getLocalGenerationCosts({
        textModel: 'gemini-custom-text',
        reviewModel: 'gemini-custom-review',
        imageModel: 'gemini-custom-image',
        textCost: 3,
        imageCost: 5,
      }),
    ).toMatchObject({ textReady: true, imageReady: true, errors: [] });
  });

  it('retains the known text floor when a custom review model is configured', () => {
    expect(
      getLocalGenerationCosts({
        ...defaults,
        reviewModel: 'gemini-custom-review',
        textCost: 0.1,
      }).textReady,
    ).toBe(false);
  });

  it('keeps text available when only the image model lacks an estimate', () => {
    expect(
      getLocalGenerationCosts({
        ...defaults,
        imageModel: 'gemini-custom-image',
      }),
    ).toMatchObject({
      textReady: true,
      imageReady: false,
      textCost: 0.19,
      imageCost: null,
    });
  });
});
