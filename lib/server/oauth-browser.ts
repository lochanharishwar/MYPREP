import type { Platform } from '../contracts';

export function oauthCookie(
  platform: Platform,
  state: string,
  secure: boolean,
  clear = false,
) {
  return `bc_oauth_${platform}=${clear ? '' : state}; Path=/api/oauth/${platform}/callback; Max-Age=${clear ? 0 : 600}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
export function assertOAuthBrowser(
  request: Request,
  platform: Platform,
  state: string,
) {
  const value = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`bc_oauth_${platform}=`))
    ?.split('=')[1];
  if (!state || value !== state)
    throw new Error(
      'Open Connect again in the browser where you started. This authorization cannot be linked to another browser.',
    );
}
