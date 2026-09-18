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
    await scope(request, c.brand_id!);
    if (
      !['qualified', 'approved', 'draft'].includes(c.payload.status) ||
      !c.payload.assetPath
    )
      throw Object.assign(new Error('Media is not available.'), {
        status: 404,
      });
    return Response.json(
      {
        url: await assetUrl(c.payload.assetPath, 300),
        expiresAt: Date.now() + 290000,
      },
      { headers: { 'Cache-Control': 'private,max-age=300' } },
    );
  } catch (e) {
    return apiFailure(e, 'media');
  }
}
