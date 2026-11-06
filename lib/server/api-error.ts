import { z } from 'zod';

/** Only deliberate application validation messages may be exposed to callers. */
export class PublicRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'PublicRequestError';
  }
}

/** Never serialize unexpected exception messages, provider bodies, or input. */
export function apiFailure(
  error: unknown,
  operation: string,
  base: Record<string, unknown> = {},
) {
  const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
  const candidate =
    error && typeof error === 'object' && 'status' in error
      ? error.status
      : undefined;
  const status = invalid
    ? 400
    : typeof candidate === 'number' &&
        Number.isInteger(candidate) &&
        candidate >= 400 &&
        candidate <= 599
      ? candidate
      : 500;
  const requestId = crypto.randomUUID();
  const messages: Record<number, [string, string]> = {
    400: ['INVALID_REQUEST', 'Invalid request. Check your inputs and retry.'],
    401: [
      'UNAUTHENTICATED',
      'Your session is unavailable or expired. Sign in again.',
    ],
    403: ['FORBIDDEN', 'Your account does not have access to this operation.'],
    404: ['NOT_FOUND', 'The requested resource is unavailable.'],
    409: ['CONFLICT', 'The record changed. Refresh before retrying.'],
    429: ['RATE_LIMITED', 'Too many requests. Please try again later.'],
  };
  const [code, defaultMessage] = messages[status] ?? [
    'UNAVAILABLE',
    'This operation is temporarily unavailable. Please retry.',
  ];
  const message = error instanceof PublicRequestError ? error.message : defaultMessage;
  if (status >= 500)
    console.error('api_request_failed', { operation, requestId, status });
  return Response.json(
    { ...base, error: message, code, requestId },
    {
      status,
      headers: {
        'Cache-Control': 'private,no-store',
        'X-Request-ID': requestId,
      },
    },
  );
}
