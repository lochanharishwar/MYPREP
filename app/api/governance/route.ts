import { apiFailure, PublicRequestError } from '@/lib/server/api-error';
import { z } from 'zod';
import { scope, db, rpc, entity } from '@/lib/server/db';
import { boundedBytes } from '@/lib/server/http';
import { assertRole } from '@/lib/domain';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const s = await scope(request);
    assertRole(s.role, ['owner']);
    const q = new URL(request.url).searchParams;
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .parse(q.get('offset') ?? undefined);
    const [members, invites, audit, outbox, permissions] = await Promise.all([
      db().from('memberships').select('*').eq('workspace_id', s.workspaceId),
      db()
        .from('invitations')
        .select('id,email,role,expires_at')
        .eq('workspace_id', s.workspaceId),
      db()
        .from('audit_log')
        .select('*')
        .eq('workspace_id', s.workspaceId)
        .order('created_at', { ascending: false })
        .range(offset, offset + 49),
      db()
        .from('workflow_outbox')
        .select('id,name,status,attempts,created_at,error,dead_at')
        .eq('data->>workspaceId', s.workspaceId)
        .eq('status', 'pending')
        .limit(100),
      db()
        .from('brand_permissions')
        .select('user_id,brand_id')
        .eq('workspace_id', s.workspaceId),
    ]);
    for (const result of [members, invites, audit, outbox, permissions])
      if (result.error) throw result.error;
    const { data: controls, error: controlsError } = await db()
      .from('entities')
      .select('id,kind,payload')
      .eq('workspace_id', s.workspaceId)
      .in('kind', ['campaign', 'approval'])
      .order('created_at', { ascending: false })
      .limit(100);
    if (controlsError) throw controlsError;
    return Response.json(
      {
        members: members.data?.map((m) => ({
          ...m,
          brands:
            permissions.data
              ?.filter((p) => p.user_id === m.user_id)
              .map((p) => p.brand_id) ?? [],
        })),
        invitations: invites.data,
        audit: audit.data,
        outbox: outbox.data,
        operations: await rpc('operations_report', {
          p_workspace: s.workspaceId,
        }),
        controls,
      },
      { headers: { 'Cache-Control': 'private,no-store' } },
    );
  } catch (e) {
    return apiFailure(e, 'governance-read');
  }
}
export async function POST(request: Request) {
  try {
    const s = await scope(request);
    assertRole(s.role, ['owner']);
    const body = z.record(z.string(), z.unknown()).parse(JSON.parse(
      new TextDecoder().decode(await boundedBytes(request, 64000)),
    ));
    const action = z
      .enum([
        'member',
        'policy',
        'revoke-invitation',
        'revoke-approval',
        'freeze',
        'retry-job',
      ])
      .parse(body.action);
    if (action === 'member') {
      const input = z
        .object({
          userId: z.uuid(),
          command: z.enum(['update', 'remove', 'transfer']),
          role: z.enum(['owner', 'editor', 'approver', 'viewer']).optional(),
          brands: z.array(z.uuid()).nullable().default(null),
          customerAccess: z.boolean().default(false),
          exportAccess: z.boolean().default(false),
          stages: z
            .array(z.enum(['creative', 'brand', 'legal']))
            .default(['brand']),
        })
        .parse(body);
      await rpc('manage_member', {
        p_workspace: s.workspaceId,
        p_actor: s.user.id,
        p_user: input.userId,
        p_action: input.command,
        p_role: input.role ?? null,
        p_brands: input.brands,
        p_customer: input.customerAccess,
        p_export: input.exportAccess,
      });
      if (input.command === 'update') {
        const { error } = await db()
          .from('memberships')
          .update({ approval_stages: input.stages })
          .eq('workspace_id', s.workspaceId)
          .eq('user_id', input.userId);
        if (error) throw error;
      }
      return Response.json({ saved: true });
    }
    if (action === 'policy') {
      const p = z
        .object({
          publishingPaused: z.boolean(),
          requireMfa: z.boolean(),
          sessionHours: z.number().int().min(1).max(720),
          stages: z
            .array(z.enum(['creative', 'brand', 'legal']))
            .min(1)
            .max(3),
          separationOfDuties: z.boolean(),
          expiresHours: z.number().int().min(1).max(720),
        })
        .parse(body);
      if (p.requireMfa && s.aal !== 'aal2')
        throw new PublicRequestError(
          'Verify your authenticator in Sign-in settings before enforcing MFA.',
        );
      const { error } = await db()
        .from('workspaces')
        .update({
          publishing_paused: p.publishingPaused,
          require_mfa: p.requireMfa,
          session_hours: p.sessionHours,
          approval_policy: {
            stages: [...new Set(p.stages)],
            separationOfDuties: p.separationOfDuties,
            expiresHours: p.expiresHours,
          },
        })
        .eq('id', s.workspaceId);
      if (error) throw error;
    }
    if (action === 'revoke-invitation') {
      const { error } = await db()
        .from('invitations')
        .delete()
        .eq('workspace_id', s.workspaceId)
        .eq('id', z.uuid().parse(body.id));
      if (error) throw error;
    }
    if (action === 'revoke-approval') {
      await rpc('revoke_approval', {
        p_workspace: s.workspaceId,
        p_id: z.uuid().parse(body.id),
        p_actor: s.user.id,
      });
    }
    if (action === 'freeze') {
      const c = await entity(
        z.uuid().parse(body.id),
        s.workspaceId,
        'campaign',
      );
      const {error} = await db().from('entities').update({campaign_frozen:z.boolean().parse(body.frozen),updated_at:new Date().toISOString()}).eq('id',c.id).eq('workspace_id',s.workspaceId);
      if(error) throw error;
    }
    if (action === 'retry-job') {
      const id = z.string().min(1).max(250).parse(body.id);
      const { data, error: lookupError } = await db()
        .from('workflow_outbox')
        .select('data')
        .eq('id', id)
        .eq('data->>workspaceId', s.workspaceId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (data?.data?.workspaceId !== s.workspaceId)
        throw new PublicRequestError('The requested job is unavailable.', 404);
      const { error: retryError } = await db()
        .from('workflow_outbox')
        .update({
          attempts: 0,
          dead_at: null,
          next_attempt_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('data->>workspaceId', s.workspaceId);
      if (retryError) throw retryError;
    }
    const { error } = await db()
      .from('audit_log')
      .insert({
        workspace_id: s.workspaceId,
        actor_id: s.user.id,
        action,
        resource_id: z.uuid().safeParse(body.id).success ? body.id : null,
        details: {},
      });
    if (error) throw error;
    return Response.json({ saved: true });
  } catch (e) {
    return apiFailure(e, 'governance-write');
  }
}
