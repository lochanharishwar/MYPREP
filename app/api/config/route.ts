import { env, serviceStatus } from '@/lib/server/env';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(
    {
      supabaseUrl: env('SUPABASE_URL'),
      supabaseKey: env('SUPABASE_ANON_KEY'),
      services: serviceStatus(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
