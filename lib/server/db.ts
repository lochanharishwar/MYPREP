import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { required } from './env';
import type { Entity, Role } from '../contracts';
export const db = () =>
  createClient(
    required('SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
export async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token)
    throw Object.assign(new Error('Sign in to your workspace.'), {
      status: 401,
    });
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user)
    throw Object.assign(new Error('Your session has expired. Sign in again.'), {
      status: 401,
    });
  return data.user;
}
export async function scope(request: Request, brandId?: string) {
  const user = await authenticate(request);
  const workspaceId = request.headers.get('x-workspace-id');
  let q = db()
    .from('memberships')
    .select(
      'workspace_id,role,customer_access,export_access,brand_access,workspaces(*)',
    )
    .eq('user_id', user.id);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  if (!data)
    throw Object.assign(
      new Error('Create a workspace or ask an owner for an invitation.'),
      { status: 403 },
    );
  if (brandId) {
    const { data: b } = await db()
      .from('brands')
      .select('id')
      .eq('id', brandId)
      .eq('workspace_id', data.workspace_id)
      .maybeSingle();
    if (!b) throw Object.assign(new Error('Brand not found.'), { status: 404 });
    if (
      !(await rpc<boolean>('brand_access_for_user', {
        p_brand: brandId,
        p_user: user.id,
      }))
    )
      throw Object.assign(
        new Error('Your workspace role does not grant access to this brand.'),
        { status: 403 },
      );
  }
  const workspace = Array.isArray(data.workspaces)
    ? data.workspaces[0]
    : data.workspaces;
  const token =
    request.headers.get('authorization')?.replace(/^Bearer /i, '') ?? '';
  const claims = JSON.parse(
    Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
  ) as { aal?: string };
  if (workspace.require_mfa && claims.aal !== 'aal2')
    throw Object.assign(
      new Error(
        'This workspace requires MFA. Complete authenticator verification in account settings.',
      ),
      { status: 403 },
    );
  if (
    user.last_sign_in_at &&
    Date.now() - Date.parse(user.last_sign_in_at) >
      workspace.session_hours * 3600000
  )
    throw Object.assign(
      new Error('Workspace session policy requires you to sign in again.'),
      { status: 401 },
    );
  return {
    user,
    workspaceId: data.workspace_id as string,
    role: data.role as Role,
    workspace: data.workspaces,
    customerAccess: data.role === 'owner' || data.customer_access,
    exportAccess: data.role === 'owner' || data.export_access,
    brandAccess: data.brand_access,
    aal: claims.aal,
  };
}
export async function insertEntity<T>(
  workspaceId: string,
  brandId: string | null,
  kind: string,
  payload: T,
  id = crypto.randomUUID(),
) {
  const { data, error } = await db()
    .from('entities')
    .insert({ id, workspace_id: workspaceId, brand_id: brandId, kind, payload })
    .select()
    .single();
  if (error) throw error;
  return data as Entity<T>;
}
export async function entity<T = Record<string, unknown>>(
  id: string,
  workspaceId?: string,
  kind?: string,
) {
  let q = db().from('entities').select('*').eq('id', id);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q.single();
  if (error || !data)
    throw Object.assign(new Error('Record not found.'), { status: 404 });
  return data as Entity<T>;
}
export async function updateEntity(id: string, payload: unknown) {
  const { error } = await db()
    .from('entities')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export async function assetUrl(path: string, ttl = 3600) {
  const { data, error } = await db()
    .storage.from('media')
    .createSignedUrl(path, ttl);
  if (error) throw error;
  return data.signedUrl;
}
export async function storeAsset(
  workspaceId: string,
  brandId: string,
  bytes: Uint8Array,
  mime: string,
) {
  const path = `${workspaceId}/${brandId}/${crypto.randomUUID()}.${mime === 'video/mp4' ? 'mp4' : mime === 'image/jpeg' ? 'jpg' : 'png'}`;
  const { error } = await db()
    .storage.from('media')
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  return path;
}
