import { env } from '@/lib/server/env';
import { serviceStatus } from '@/lib/server/service-status';
import { getLocalGenerationCosts } from '@/lib/generation-costs';
export const dynamic = 'force-dynamic';
export async function GET() {
  let localAppUrl = 'http://localhost:3000/content';
  try {
    const configured = new URL(env('LOCAL_APP_URL', localAppUrl));
    if (
      ['http:', 'https:'].includes(configured.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname) &&
      !configured.username &&
      !configured.password
    )
      localAppUrl = `${configured.origin}/content`;
  } catch {
    // Invalid optional configuration keeps the standard local address.
  }
  const providerConfigured = !!env('GEMINI_API_KEY');
  const hosted = process.env.NODE_ENV === 'production';
  const model = env('GEMINI_TEXT_MODEL', 'gemini-3.1-pro-preview');
  const reviewModel = env('GEMINI_REVIEW_MODEL', model);
  const imageModel = env('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image');
  const costs = getLocalGenerationCosts({
    textModel: model,
    reviewModel,
    imageModel,
    textCost: env('COST_TEXT'),
    imageCost: env('COST_IMAGE'),
  });
  const generationReason = !providerConfigured
    ? 'Add your Gemini API key to the server to enable image and text creation.'
    : hosted
      ? 'Gemini is configured. Paid creation on this public site needs the secure server workspace and enforced spending limits. You can use your configured Gemini provider on localhost.'
      : 'Gemini is configured. Review the displayed reservation and set your monthly and campaign limits before creating content.';
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
        ...costs,
        localAppUrl,
        ready: !hosted && providerConfigured,
        providerConfigured,
        reason: generationReason,
        model,
        reviewModel,
        imageModel,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
