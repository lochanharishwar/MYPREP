import { apiFailure } from '@/lib/server/api-error';
import { db, scope, authenticate, rpc } from '@/lib/server/db';
import { env, serviceStatus } from '@/lib/server/env';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const base = {
    configured: !!env('SUPABASE_URL'),
    authenticated: false,
    brands: [],
    entities: [],
    workspaces: [],
    services: serviceStatus(),
  };
  if (!base.configured) return Response.json(base);
  try {
    const user = await authenticate(request);
    const { data: memberships, error: me } = await db()
      .from('memberships')
      .select('workspace_id,role,workspaces(id,name)')
      .eq('user_id', user.id);
    if (me) throw me;
    const workspaces = (memberships ?? []).map((m) => ({
      ...(Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces),
      id: m.workspace_id,
      role: m.role,
    }));
    if (!workspaces.length)
      return Response.json({
        ...base,
        authenticated: true,
        user: { id: user.id, email: user.email },
        workspaces,
      });
    const s = await scope(request);
    const { data: brands, error } = await db()
      .from('brands')
      .select('*')
      .eq('workspace_id', s.workspaceId)
      .order('name');
    if (error) throw error;
    const workspace = Array.isArray(s.workspace) ? s.workspace[0] : s.workspace;
    const visibleBrands = [];
    for (const brand of brands ?? []) {
      if (
        s.role === 'owner' ||
        s.brandAccess === 'all' ||
        (await rpc<boolean>('brand_access_for_user', {
          p_brand: brand.id,
          p_user: s.user.id,
        }))
      )
        visibleBrands.push(brand);
    }
    return Response.json(
      {
        ...base,
        authenticated: true,
        user: { id: user.id, email: user.email },
        workspace: { ...workspace, role: s.role },
        workspaces,
        brands: visibleBrands,
        budget: await rpc('budget_usage', { p_workspace: s.workspaceId }),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return apiFailure(e, 'state', base);
  }
}
