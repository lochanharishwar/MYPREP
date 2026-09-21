import { z } from 'zod';
import { boundedBytes } from './http';
import { env } from './env';

// These endpoints never bypass the authenticated, durable workspace API.
export function assertLocalRequest(request: Request) {
  const hosted = process.env.NODE_ENV === 'production';
  if (
    hosted &&
    (env('BROWSER_WORKSPACE_MODE') !== 'sites' ||
      !request.headers.get('oai-authenticated-user-id'))
  )
    throw Object.assign(
      new Error(
        'Hosted browser processing requires the private Sites workspace configuration.',
      ),
      { status: 403 },
    );
  const url = new URL(request.url);
  if (!hosted && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw Object.assign(
      new Error('Local processing requires a loopback server.'),
      { status: 403 },
    );
  const origin = request.headers.get('origin');
  if (
    (origin && origin !== url.origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw Object.assign(new Error('Cross-site requests are not allowed.'), {
      status: 403,
    });
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw Object.assign(new Error('Send a JSON request.'), { status: 415 });
}
export async function localBody(request: Request) {
  assertLocalRequest(request);
  const text = new TextDecoder().decode(await boundedBytes(request, 500000));
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('The request body must be valid JSON.'), {
      status: 400,
    });
  }
}
export function localFailure(error: unknown) {
  const e = error as Error & { status?: number };
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: error.issues
          .map((x) => `${x.path.join('.')}: ${x.message}`)
          .join('; '),
      },
      { status: 400 },
    );
  return Response.json(
    {
      error:
        e.message ||
        'Request failed. Retry after checking the service settings.',
    },
    { status: e.status ?? 502 },
  );
}
