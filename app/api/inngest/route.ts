import { serve } from 'inngest/next';
import { inngest, functions } from '@/lib/server/workflows';
import { env } from '@/lib/server/env';
import type { NextRequest } from 'next/server';
const handler = serve({ client: inngest, functions });
export const dynamic = 'force-dynamic';
export async function GET(r: NextRequest, c: unknown) {
  if (!env('INNGEST_SIGNING_KEY'))
    return Response.json(
      { error: 'Background jobs are not configured.' },
      { status: 503 },
    );
  return handler.GET(r, c);
}
export async function POST(r: NextRequest, c: unknown) {
  if (!env('INNGEST_SIGNING_KEY'))
    return Response.json(
      { error: 'Background jobs are not configured.' },
      { status: 503 },
    );
  return handler.POST(r, c);
}
export async function PUT(r: NextRequest, c: unknown) {
  if (!env('INNGEST_SIGNING_KEY'))
    return Response.json(
      { error: 'Background jobs are not configured.' },
      { status: 503 },
    );
  return handler.PUT(r, c);
}
