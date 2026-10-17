import { env, serviceStatus } from '@/lib/server/env';
export const dynamic = 'force-dynamic';
export async function GET() {
  const providerConfigured = !!env('GEMINI_API_KEY');
  const hosted = process.env.NODE_ENV === 'production';
  const generationReason = !providerConfigured
    ? 'Add your Gemini API key to the server to enable image and text creation.'
    : hosted
      ? 'Gemini is configured. Paid creation on this public site needs the secure server workspace and enforced spending limits. You can use your configured Gemini provider on localhost.'
      : 'Gemini is configured. Set positive job cost estimates on the server and a monthly limit in Workspace settings before starting paid creation.';
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
        ready: !hosted && providerConfigured,
        providerConfigured,
        reason: generationReason,
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
