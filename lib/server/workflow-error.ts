import { PublicRequestError } from './api-error';

/** Persist safe diagnostics only: workflow records are visible to workspace users. */
export function workflowError(error: unknown): string {
  if (error instanceof PublicRequestError) return error.message;
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
    return 'The operation timed out or was cancelled. Check its status before retrying.';
  const status = error && typeof error === 'object' && 'providerStatus' in error
    ? error.providerStatus : undefined;
  if (status === 401 || status === 403)
    return 'The provider denied access. Check the connected account and its permissions.';
  if (status === 429)
    return 'The provider rate or quota limit was reached. Check your allowance before retrying.';
  return 'The operation could not complete. Check service configuration and job status before retrying.';
}
