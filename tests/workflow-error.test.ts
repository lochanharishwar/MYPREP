import { describe, expect, it } from 'vitest';
import { workflowError } from '@/lib/server/workflow-error';
import { PublicRequestError } from '@/lib/server/api-error';

describe('persisted workflow diagnostics', () => {
  it('does not persist provider responses, signed URLs, SQL or credential text', () => {
    for (const error of [new Error('https://provider.example?token=private-fixture'),
      { message: 'SQL private-fixture', status: 500 }, 'private-fixture']) {
      expect(workflowError(error)).not.toContain('private-fixture');
    }
  });
  it('retains deliberately public validation messages', () => {
    expect(workflowError(new PublicRequestError('Choose a connected account.'))).toBe('Choose a connected account.');
  });
  it('provides safe recovery guidance for provider limits and cancellation', () => {
    expect(workflowError({ providerStatus: 429, message: 'private-fixture' })).toContain('quota');
    expect(workflowError({ providerStatus: 403, message: 'private-fixture' })).toContain('permissions');
    expect(workflowError(new DOMException('private-fixture', 'AbortError'))).toContain('cancelled');
  });
});
