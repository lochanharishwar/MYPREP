import type { Platform } from './contracts';

// Public product information only. OAuth secrets and tokens never enter this module.
export const socialCatalog: Record<
  Platform,
  {
    name: string;
    logo: string;
    formats: string;
    permission: string;
    requirement: string;
    analytics: string;
    docs: string;
    studio: string;
  }
> = {
  youtube: {
    name: 'YouTube',
    logo: '/platforms/youtube.png',
    formats: 'Video',
    permission: 'Upload videos and read your channel performance.',
    requirement:
      'Choose a Google account with a YouTube channel. Account settings and API permissions determine upload availability.',
    analytics: 'Views, likes, comments and watch time when authorized.',
    docs: 'https://developers.google.com/youtube/v3/docs/videos/insert',
    studio: 'https://studio.youtube.com/',
  },
  x: {
    name: 'X / Twitter',
    logo: '/platforms/x.png',
    formats: 'Text · Image · Video',
    permission: 'Create posts, upload media and read available post metrics.',
    requirement:
      'The app needs X API access, available credits and write/media permissions.',
    analytics: 'Impressions and engagement, subject to API access.',
    docs: 'https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code',
    studio: 'https://x.com/compose/post',
  },
  instagram: {
    name: 'Instagram',
    logo: '/platforms/instagram.png',
    formats: 'Image · Reels',
    permission: 'Publish media and read insights and comments.',
    requirement:
      'A Business or Creator account and approved app permissions are required.',
    analytics: 'Reach, views, likes, saves and shares when supplied.',
    docs: 'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login',
    studio: 'https://business.facebook.com/',
  },
  linkedin: {
    name: 'LinkedIn',
    logo: '/platforms/linkedin.svg',
    formats: 'Text · Image · Video',
    permission: 'Identify your profile and publish posts on your behalf.',
    requirement:
      'Member posting is the default. Organization posting and reading engagement require additional approved permissions.',
    analytics:
      'Likes and comments only with the required read access; reach is unavailable.',
    docs: 'https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin',
    studio: 'https://www.linkedin.com/feed/',
  },
  reddit: {
    name: 'Reddit',
    logo: '/platforms/reddit.png',
    formats: 'Text · Media links',
    permission: 'Read your profile, submit posts and read their feedback.',
    requirement:
      'Approved API access and a subreddit that permits your content. Media is published as a link.',
    analytics: 'Net score and comments; impressions are unavailable.',
    docs: 'https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data',
    studio: 'https://www.reddit.com/submit',
  },
};

export const socialOrder: Platform[] = [
  'youtube',
  'x',
  'instagram',
  'linkedin',
  'reddit',
];
export function socialSetup(
  platform: Platform,
  services: { name: string; ready: boolean }[],
  localMode: boolean,
) {
  const ready = (name: string) =>
    services.some((s) => s.name === name && s.ready);
  const service =
    platform === 'x' ? 'X' : platform[0].toUpperCase() + platform.slice(1);
  const missing = [
    ...(!ready('Server workspace') ? ['Secure account storage'] : []),
    ...(!ready('Social token protection') ? ['Encrypted token storage'] : []),
    ...(!ready(service)
      ? [`${socialCatalog[platform].name} app registration`]
      : []),
    ...(localMode ? ['Enable the secure server workspace'] : []),
  ];
  return {
    missing,
    connectReady: missing.length === 0,
    backgroundReady: ready('Background jobs'),
  };
}
