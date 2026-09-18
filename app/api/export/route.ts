import { apiFailure } from '@/lib/server/api-error';
import { z } from 'zod';
import { scope, db } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      brandId = z.uuid().parse(q.get('brandId'));
    const s = await scope(request, brandId);
    if (!s.exportAccess || !s.customerAccess)
      throw Object.assign(
        new Error('Customer-data and export privileges are required.'),
        { status: 403 },
      );
    const kind = z.enum(['customers', 'accounts']).parse(q.get('kind'));
    const after = q.get('after') ? z.uuid().parse(q.get('after')) : null;
    let query = db()
      .from('entities')
      .select('id,payload')
      .eq('workspace_id', s.workspaceId)
      .eq('brand_id', brandId)
      .eq('kind', kind)
      .order('id')
      .limit(201);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data?.slice(0, 200) ?? [],
      columns =
        kind === 'customers'
          ? ['customerId', 'name', 'email', 'accountId']
          : ['accountId', 'name'];
    const cell = (value: unknown) => {
      let text =
        typeof value === 'string'
          ? value
          : typeof value === 'number'
            ? value.toString()
            : '';
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const csv = [
      columns.join(','),
      ...rows.map((r) => columns.map((c) => cell(r.payload[c])).join(',')),
    ].join('\r\n');
    const { error: auditError } = await db()
      .from('audit_log')
      .insert({
        workspace_id: s.workspaceId,
        brand_id: brandId,
        actor_id: s.user.id,
        action: 'customer_data.exported',
        details: { kind, rowCount: rows.length },
      });
    if (auditError) throw auditError;
    return Response.json(
      {
        csv,
        nextCursor: data && data.length > 200 ? rows.at(-1)?.id : null,
        count: rows.length,
      },
      { headers: { 'Cache-Control': 'private,no-store' } },
    );
  } catch (e) {
    return apiFailure(e, 'export');
  }
}
