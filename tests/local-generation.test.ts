import { describe, expect, it } from 'vitest';
import {
  localAttemptReserve,
  localCampaignReserve,
  localGenerationPairs,
} from '../lib/local-generation';

describe('local generation reservations', () => {
  const costs = { textCost: 0.19, imageCost: 1.33 };
  it('counts supported unique platform versions only', () => {
    expect(
      localGenerationPairs(
        ['instagram', 'instagram', 'youtube', 'x'],
        ['text', 'image', 'image'],
      ),
    ).toEqual([
      { platform: 'instagram', format: 'image' },
      { platform: 'x', format: 'text' },
      { platform: 'x', format: 'image' },
    ]);
    expect(localGenerationPairs(['unknown'], ['image'])).toEqual([]);
  });
  it('includes copy and finished-media review in every reservation', () => {
    expect(localAttemptReserve('text', costs)).toBe(0.38);
    expect(localAttemptReserve('image', costs)).toBe(1.71);
    expect(
      localCampaignReserve(['instagram', 'x'], ['text', 'image'], costs),
    ).toEqual({ variants: 3, firstPass: 3.8, fullRun: 19 });
  });
  it('requires only the cost settings used by the chosen format', () => {
    expect(
      localAttemptReserve('text', { textCost: 0.19, imageCost: null }),
    ).toBe(0.38);
    for (const value of [null, 0, -1, NaN, Infinity]) {
      expect(
        localAttemptReserve('image', { ...costs, imageCost: value }),
      ).toBeNull();
      expect(
        localAttemptReserve('text', { ...costs, textCost: value }),
      ).toBeNull();
    }
    expect(localCampaignReserve([], ['text'], costs)).toBeNull();
  });
  it('rounds reservations up to cents without floating-point overcharging', () => {
    expect(localAttemptReserve('text', { ...costs, textCost: 0.1 })).toBe(0.2);
    expect(localAttemptReserve('text', { ...costs, textCost: 0.191 })).toBe(
      0.39,
    );
  });
});
