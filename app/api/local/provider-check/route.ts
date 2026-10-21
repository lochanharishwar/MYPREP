import { z } from 'zod';
import { localBody, localFailure } from '@/lib/server/local-request';
import { checkGeminiConnection } from '@/lib/server/gemini-client';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === 'production')
      throw Object.assign(
        new Error('Provider connection checks are available in the local app.'),
        { status: 503 },
      );
    z.object({})
      .strict()
      .parse(await localBody(request));
    return Response.json(await checkGeminiConnection(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return localFailure(error);
  }
}
