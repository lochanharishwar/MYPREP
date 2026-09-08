import { z } from 'zod';
import { db, scope } from '@/lib/server/db';
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
      throw new Error('Page one resource at a time.');
    const groups = await Promise.all(
      selected.map(async (kind) => {
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
        let q = db()
          .from('entities')
          .select('*', { count: 'exact' })
          .eq('workspace_id', s.workspaceId)
          .eq('brand_id', brandId)
          .eq('kind', kind)
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
        const rows = data ?? [];
        if (kind === 'page')
          for (const row of rows) {
            row.payload = {
              ...row.payload,
              markdown: undefined,
              html: undefined,
              styles: undefined,
            };
          }
        const last = rows.at(-1);
        return {
          kind,
          rows,
          total: count ?? 0,
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
    return Response.json(
      { error: (e as Error).message },
      { status: (e as Error & { status?: number }).status ?? 400 },
    );
  }
}
