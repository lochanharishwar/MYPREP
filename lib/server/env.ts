import 'server-only';
export function env(name: string, fallback = '') {
  return process.env[name] || fallback;
}
export function required(name: string) {
  const value = env(name);
  if (!value)
    throw Object.assign(
      new Error(`${name} must be configured before this service can run.`),
      { status: 503 },
    );
  return value;
}
export const serviceStatus = () => [
  {
    name: 'Basic website scan',
    ready:
      process.env.NODE_ENV !== 'production' ||
      env('BROWSER_WORKSPACE_MODE') === 'sites',
    detail:
      'Public HTML, linked pages and CSS; no API key needed. Coverage is limited and JavaScript is not executed.',
  },
  {
    name: 'Server workspace',
    ready:
      !!env('SUPABASE_URL') &&
      !!env('SUPABASE_ANON_KEY') &&
      !!env('SUPABASE_SERVICE_ROLE_KEY'),
    detail:
      'Supabase database and private storage for teams, social accounts and durable workflows. Local drafting needs no app account.',
  },
  {
    name: 'Website discovery',
    ready: !!env('FIRECRAWL_API_KEY') && !!env('BROWSERLESS_API_KEY'),
    detail: 'Firecrawl and Browserless',
  },
  {
    name: 'Generation & review',
    ready: !!env('GEMINI_API_KEY'),
    detail: env('GEMINI_API_KEY')
      ? process.env.NODE_ENV === 'production' &&
        env('BROWSER_WORKSPACE_MODE') === 'sites'
        ? 'Gemini key configured. Paid creation on this public site requires the secure server workspace and enforced spending limits. Localhost can use the configured provider with local limits.'
        : 'Gemini key configured. Local default models include conservative cost estimates; set your workspace and campaign limits before creation. Model access and quota are checked on each request.'
      : 'Missing GEMINI_API_KEY on the server. Use your Google AI Studio key; no image generation is available until configured.',
  },
  {
    name: 'Background jobs',
    ready: !!env('INNGEST_EVENT_KEY') && !!env('INNGEST_SIGNING_KEY'),
    detail: 'Inngest event and signing keys; reachable callback required',
  },
  {
    name: 'Social token protection',
    ready:
      !!env('TOKEN_ENCRYPTION_KEY') ||
      (!!env('TOKEN_ACTIVE_KEY_ID') && !!env('TOKEN_ENCRYPTION_KEYS')),
    detail:
      'Server encryption for social account access. No account tokens are stored in the browser.',
  },
  {
    name: 'Media & attribution',
    ready: !!env('PROCESSOR_URL') && !!env('PROCESSOR_SECRET'),
    detail: 'Cloud Run Python processor',
  },
  ...['INSTAGRAM', 'YOUTUBE', 'X', 'LINKEDIN', 'REDDIT'].map((p) => ({
    name: p === 'X' ? 'X' : p[0] + p.slice(1).toLowerCase(),
    ready: !!env(p + '_CLIENT_ID') && !!env(p + '_CLIENT_SECRET'),
    detail: 'OAuth app credentials; account authorization is separate',
  })),
];
