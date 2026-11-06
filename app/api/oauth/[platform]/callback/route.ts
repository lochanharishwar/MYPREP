import { platforms } from '@/lib/contracts';
import { exchange, identity } from '@/lib/server/social';
import { db, rpc } from '@/lib/server/db';
import { decrypt, encrypt } from '@/lib/server/security';
import { required } from '@/lib/server/env';
import { assertOAuthBrowser, oauthCookie } from '@/lib/server/oauth-browser';
import { PublicRequestError } from '@/lib/server/api-error';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const url = new URL(request.url);
  const origin = required('APP_ORIGIN');
  const redirect = (path: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `${origin}${path}`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        ...(platforms.includes(platform as (typeof platforms)[number])
          ? {
              'Set-Cookie': oauthCookie(
                platform as (typeof platforms)[number],
                '',
                new URL(origin).protocol === 'https:',
                true,
              ),
            }
          : {}),
      },
    });
  try {
    if (!platforms.includes(platform as (typeof platforms)[number]))
      throw new PublicRequestError('Unknown platform.');
    const state = url.searchParams.get('state'),
      code = url.searchParams.get('code');
    if (!state) throw new PublicRequestError('Authorization was not completed.');
    assertOAuthBrowser(request, platform as (typeof platforms)[number], state);
    const row = await rpc<{
      workspace_id: string;
      brand_id: string;
      payload: {
        platform: string;
        verifier: string;
        userId: string;
        returnTo?: string;
      };
    } | null>('consume_oauth_state', { p_id: state, p_platform: platform });
    if (!row)
      throw new PublicRequestError('Authorization link expired or was already used.');
    if (!code || url.searchParams.has('error'))
      throw new PublicRequestError(
        'Permission was not granted. Your account was not connected. You can try again whenever you are ready.',
      );
    const { data: membership, error: membershipError } = await db()
      .from('memberships')
      .select('role')
      .eq('workspace_id', row.workspace_id)
      .eq('user_id', row.payload.userId)
      .eq('role', 'owner')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new PublicRequestError('Workspace owner access is required.');
    const p = platform as (typeof platforms)[number];
    const tokens = await exchange(
      p,
      code,
      await decrypt<string>(row.payload.verifier),
    );
    const who = await identity(p, tokens.access_token);
    await rpc('reconnect_social_account', {
      p_workspace: row.workspace_id,
      p_brand: row.brand_id,
      p_actor: row.payload.userId,
      p_encrypted: await encrypt(tokens),
      p_connection: {
        platform: p,
        ...who,
        status: 'connected',
        expiresAt: tokens.expires_at
          ? new Date(tokens.expires_at).toISOString()
          : undefined,
      },
    });
    const returnTo = ['/', '/schedule', '/analytics'].includes(
      row.payload.returnTo ?? '',
    )
      ? row.payload.returnTo!
      : '/schedule';
    return redirect(`${returnTo}?connected=${encodeURIComponent(platform)}`);
  } catch (e) {
    const message = e instanceof PublicRequestError
      ? e.message
      : 'The account could not be connected. Check provider setup and try again.';
    return redirect(
      `/schedule?connectionError=${encodeURIComponent(message)}`,
    );
  }
}
