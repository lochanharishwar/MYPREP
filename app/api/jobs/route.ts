import { apiFailure } from '@/lib/server/api-error';
import { z } from 'zod';
import { db, scope } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      brandId = z.uuid().parse(q.get('brandId'));
    const s = await scope(request, brandId);
    const since = z.iso
      .datetime({ offset: true })
      .parse(q.get('since') ?? new Date(Date.now() - 60000).toISOString());
    const afterId = z
      .uuid()
      .parse(q.get('afterId') || '00000000-0000-0000-0000-000000000000');
    const { data, error } = await db()
      .from('entities')
      .select('id,workspace_id,brand_id,kind,payload,created_at,updated_at')
      .eq('workspace_id', s.workspaceId)
      .eq('brand_id', brandId)
      .in('kind', ['scan', 'campaign', 'schedule', 'activity'])
      .or(`updated_at.gt.${since},and(updated_at.eq.${since},id.gt.${afterId})`)
      .order('updated_at')
      .order('id')
      .limit(100);
    if (error) throw error;
    return Response.json(
      {
        rows: data ?? [],
        cursor: data?.at(-1)?.updated_at ?? since,
        cursorId: data?.at(-1)?.id ?? afterId,
        hasMore: data?.length === 100,
      },
      { headers: { 'Cache-Control': 'private,no-store' } },
    );
  } catch (e) {
    return apiFailure(e, 'jobs');
  }
}
