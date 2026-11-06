import 'server-only';
import { env } from './env';
import { storageBuckets } from './storage';

function storageConfigurationError() {
  try {
    storageBuckets();
    return '';
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Storage configuration is incomplete.';
  }
}

const hasDatabaseCredentials = () =>
  !!env('SUPABASE_URL') &&
  !!env('SUPABASE_ANON_KEY') &&
  !!env('SUPABASE_SERVICE_ROLE_KEY');

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
    ready: hasDatabaseCredentials() && !storageConfigurationError(),
    detail: !hasDatabaseCredentials()
      ? 'Supabase server credentials are missing. Local drafting needs no app account.'
      : storageConfigurationError() ||
        'Supabase credentials and storage settings configured. Database access and migrations require verification. Local drafting needs no app account.',
  },
  {
    name: 'Website discovery',
    ready: !!env('FIRECRAWL_API_KEY') && !!env('BROWSERLESS_API_KEY') && env('BROWSERLESS_EGRESS_PROTECTED') === 'true',
    detail: 'Firecrawl and Browserless credentials plus verified browser network isolation are required for advanced discovery. Basic HTML scans remain available.',
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
