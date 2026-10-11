import { z } from 'zod';
import { scope, entity } from '@/lib/server/db';
import { apiFailure } from '@/lib/server/api-error';
import { timingHistory } from '@/lib/server/timing-history';
import { platforms, type Platform } from '@/lib/contracts';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const brandId = z.uuid().parse(params.get('brandId'));
    const accountId = z.uuid().parse(params.get('accountId'));
    const s = await scope(request, brandId);
    const account = await entity<{ platform: Platform }>(
      accountId,
      s.workspaceId,
      'connection',
    );
    if (account.brand_id !== brandId)
      throw Object.assign(new Error('Account unavailable.'), { status: 404 });
    const platform = z.enum(platforms).parse(account.payload.platform);
    const result = await timingHistory(
      s.workspaceId,
      brandId,
      accountId,
      platform,
    );
    return Response.json(result, {
      headers: { 'Cache-Control': 'private,no-store' },
    });
  } catch (error) {
    return apiFailure(error, 'timing');
  }
}
