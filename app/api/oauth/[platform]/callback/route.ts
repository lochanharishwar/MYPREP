import { platforms } from '@/lib/contracts';
import { exchange, identity } from '@/lib/server/social';
import { db, rpc } from '@/lib/server/db';
import { decrypt, encrypt } from '@/lib/server/security';
import { required } from '@/lib/server/env';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const url = new URL(request.url);
  try {
    if (!platforms.includes(platform as (typeof platforms)[number]))
      throw new Error('Unknown platform.');
    const state = url.searchParams.get('state'),
      code = url.searchParams.get('code');
    if (!state || !code) throw new Error('Authorization was not completed.');
    const row = await rpc<{
      workspace_id: string;
      brand_id: string;
      payload: { platform: string; verifier: string; userId: string };
    } | null>('consume_oauth_state', { p_id: state, p_platform: platform });
    if (!row)
      throw new Error('Authorization link expired or was already used.');
    const { data: membership } = await db()
      .from('memberships')
      .select('role')
      .eq('workspace_id', row.workspace_id)
      .eq('user_id', row.payload.userId)
      .eq('role', 'owner')
      .maybeSingle();
    if (!membership) throw new Error('Workspace owner access is required.');
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
    return Response.redirect(
      `${required('APP_ORIGIN')}/?connected=${encodeURIComponent(platform)}`,
    );
  } catch (e) {
    return Response.redirect(
      `${required('APP_ORIGIN')}/?connectionError=${encodeURIComponent((e as Error).message)}`,
    );
  }
}
