import { z } from 'zod';
import { db, scope, rpc } from '@/lib/server/db';
import type { Entity } from '@/lib/contracts';
const kinds = z.enum([
  'brand_asset',
  'connection',
  'approval',
  'content',
  'campaign',
  'dna',
  'schedule',
  'scan',
  'page',
  'post_insight',
  'activity',
  'insight',
  'feedback_summary',
  'news',
  'customers',
  'accounts',
  'markov',
  'metrics',
  'attribution',
  'spend',
]);
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const brandId = z.uuid().parse(params.get('brandId'));
    const s = await scope(request, brandId);
    const selected = z
      .array(kinds)
      .max(12)
      .parse((params.get('kinds') ?? 'connection').split(','));
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .parse(params.get('limit') ?? undefined);
    const cursor = params.get('cursor')
      ? z
          .object({ at: z.iso.datetime({ offset: true }), id: z.uuid() })
          .parse(
            JSON.parse(
              Buffer.from(params.get('cursor')!, 'base64url').toString(),
            ),
          )
      : null;
    if (cursor && selected.length !== 1)
      throw Object.assign(new Error('Page one resource at a time.'), {
        status: 400,
      });
    const search = z
      .string()
      .trim()
      .max(200)
      .parse(params.get('q') ?? '');
    if (search && (selected.length !== 1 || selected[0] !== 'page'))
      throw Object.assign(
        new Error('Search is supported for page insights only.'),
        { status: 400 },
      );
    const groups = await Promise.all(
      selected.map(async (kind) => {
        if (kind === 'page') {
          const result = await rpc<{
            rows: Entity[];
            total: number;
            hasMore: boolean;
          }>('search_page_insights', {
            p_workspace: s.workspaceId,
            p_brand: brandId,
            p_query: search,
            p_limit: limit,
            p_after_at: cursor?.at ?? null,
            p_after_id: cursor?.id ?? null,
          });
          const last = result.rows.at(-1);
          return {
            kind,
            rows: result.rows,
            total: result.total,
            nextCursor:
              result.hasMore && last
                ? Buffer.from(
                    JSON.stringify({ at: last.created_at, id: last.id }),
                  ).toString('base64url')
                : null,
          };
        }
        if (
          ['customers', 'accounts', 'feedback_summary'].includes(kind) &&
          !s.customerAccess
        )
          return {
            kind,
            rows: [],
            total: 0,
            nextCursor: null,
            restricted: true,
          };
        const base = () =>
          db()
            .from('entities')
            .select('*', { count: 'exact' })
            .eq('workspace_id', s.workspaceId)
            .eq('brand_id', brandId)
            .eq('kind', kind);
        let q = base()
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(kind === 'dna' ? 1 : limit);
        if (kind === 'content')
          q = q.in('payload->>status', ['qualified', 'approved', 'draft']);
        if (cursor)
          q = q.or(
            `created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`,
          );
        const { data, error, count } = await q;
        if (error) throw error;
        let total = count ?? 0;
        if (cursor) {
          let countQuery = db()
            .from('entities')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', s.workspaceId)
            .eq('brand_id', brandId)
            .eq('kind', kind);
          if (kind === 'content')
            countQuery = countQuery.in('payload->>status', [
              'qualified',
              'approved',
              'draft',
            ]);
          const counted = await countQuery;
          if (counted.error) throw counted.error;
          total = counted.count ?? 0;
        }
        const rows = data ?? [];
        const last = rows.at(-1);
        return {
          kind,
          rows,
          total,
          nextCursor:
            last && rows.length === (kind === 'dna' ? 1 : limit)
              ? Buffer.from(
                  JSON.stringify({ at: last.created_at, id: last.id }),
                ).toString('base64url')
              : null,
        };
      }),
    );
    return Response.json(
      { groups },
      { headers: { 'Cache-Control': 'private,no-store' } },
    );
  } catch (e) {
    const invalid = e instanceof z.ZodError || e instanceof SyntaxError;
    const status = invalid ? 400 : ((e as { status?: number })?.status ?? 500);
    const requestId = crypto.randomUUID();
    if (status >= 500) console.error('resources_request_failed', { requestId });
    return Response.json(
      {
        error: invalid
          ? 'Invalid resource query. Check the filters and retry.'
          : status >= 500
            ? 'Page data is temporarily unavailable. Please retry.'
            : (e as Error).message,
        code:
          status === 400
            ? 'INVALID_QUERY'
            : status === 401
              ? 'UNAUTHENTICATED'
              : status === 403
                ? 'FORBIDDEN'
                : status === 404
                  ? 'NOT_FOUND'
                  : 'UNAVAILABLE',
        requestId,
      },
      { status, headers: { 'Cache-Control': 'private,no-store' } },
    );
  }
}
