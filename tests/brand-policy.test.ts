import { describe, it, expect } from 'vitest';
import { brandPolicySchema, checkBrandCopy } from '../lib/brand-policy';
describe('approved brand policy', () => {
  const policy = {
    ...brandPolicySchema.parse({
      forbiddenClaims: ['guaranteed cure'],
      disclaimers: ['Terms apply.'],
    }),
    version: 1,
    approvedBy: 'owner',
  };
  it('requires an approved version and valid usage rights', () => {
    expect(() => checkBrandCopy('Terms apply.')).toThrow('owner');
    expect(() =>
      checkBrandCopy('Terms apply.', {
        ...policy,
        rightsExpireAt: '2000-01-01T00:00:00Z',
      }),
    ).toThrow('expired');
  });
  it('enforces forbidden phrases and required disclaimers', () => {
    expect(() =>
      checkBrandCopy('GUARANTEED CURE. Terms apply.', policy),
    ).toThrow('Forbidden');
    expect(() => checkBrandCopy('A new collection.', policy)).toThrow(
      'disclaimer',
    );
    expect(() =>
      checkBrandCopy('A new collection. Terms apply.', policy),
    ).not.toThrow();
  });
  it('does not admit unsourced approved claims', () => {
    expect(
      brandPolicySchema.safeParse({
        approvedClaims: [{ text: 'Cures everything', evidenceIds: [] }],
      }).success,
    ).toBe(false);
  });
});
