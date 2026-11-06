import { apiFailure } from '@/lib/server/api-error';
import { z } from 'zod';
import { scope, entity, assetUrl } from '@/lib/server/db';
import type { ContentVersion } from '@/lib/contracts';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get('id'));
    const s = await scope(request);
    const c = await entity<ContentVersion>(id, s.workspaceId, 'content');
    if (!c.brand_id)
      throw Object.assign(new Error('Media is not available.'), { status: 404 });
    await scope(request, c.brand_id);
    if (
      !['qualified', 'approved', 'draft'].includes(c.payload.status) ||
      !c.payload.assetPath
    )
      throw Object.assign(new Error('Media is not available.'), {
        status: 404,
      });
    const segments = c.payload.assetPath.split('/');
    if (
      segments.length !== 3 ||
      segments[0] !== s.workspaceId ||
      segments[1] !== c.brand_id ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(segments[2])
    )
      throw Object.assign(new Error('Media is not available.'), { status: 404 });
    return Response.json(
      {
        url: await assetUrl(c.payload.assetPath, 300),
        expiresAt: Date.now() + 290000,
      },
      { headers: { 'Cache-Control': 'private,no-store' } },
    );
  } catch (e) {
    return apiFailure(e, 'media');
  }
}
