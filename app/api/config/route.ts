import { env, serviceStatus } from '@/lib/server/env';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(
    {
      workspaceMode:
        process.env.NODE_ENV !== 'production' ||
        env('BROWSER_WORKSPACE_MODE') === 'sites'
          ? 'browser'
          : 'server',
      supabaseUrl: env('SUPABASE_URL'),
      supabaseKey: env('SUPABASE_ANON_KEY'),
      services: serviceStatus(),
      browserProcessing:
        process.env.NODE_ENV !== 'production' ||
        env('BROWSER_WORKSPACE_MODE') === 'sites',
      generation: {
        ready: process.env.NODE_ENV !== 'production' && !!env('GEMINI_API_KEY'),
        textCost: Number(env('COST_TEXT')),
        imageCost: Number(env('COST_IMAGE')),
        model: env('GEMINI_TEXT_MODEL', 'gemini-2.5-pro'),
        reviewModel: env(
          'GEMINI_REVIEW_MODEL',
          env('GEMINI_TEXT_MODEL', 'gemini-2.5-pro'),
        ),
        imageModel: env('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image'),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
