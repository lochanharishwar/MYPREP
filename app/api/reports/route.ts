import { z } from 'zod';
import { scope, rpc } from '@/lib/server/db';
import { env } from '@/lib/server/env';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const brand = z.uuid().parse(q.get('brandId'));
    await scope(request, brand);
    const start = z.iso.date().parse(q.get('start'));
    const end = z.iso.date().parse(q.get('end'));
    if (start >= end || Date.parse(end) - Date.parse(start) > 366 * 86400000)
      throw new Error(
        'Choose a reporting period of 1–366 days. The end date is exclusive.',
      );
    const type = z.enum(['attribution', 'metrics']).parse(q.get('type'));
    const result =
      type === 'attribution'
        ? await rpc('period_attribution', {
            p_brand: brand,
            p_start: start,
            p_end: end,
            p_days: Math.max(
              1,
              Math.min(
                365,
                Number(env('ATTRIBUTION_LOOKBACK_DAYS', '30')) || 30,
              ),
            ),
          })
        : await rpc('metric_report', {
            p_brand: brand,
            p_start: start,
            p_end: end,
            p_platform: q.get('platform') === 'all' ? null : q.get('platform'),
            p_campaign:
              q.get('campaign') && q.get('campaign') !== 'all'
                ? z.uuid().parse(q.get('campaign'))
                : null,
            p_metric: z
              .enum([
                'impressions',
                'reach',
                'views',
                'likes',
                'comments',
                'shares',
                'saves',
                'clicks',
                'watchTime',
                'averageWatchPercentage',
              ])
              .parse(q.get('metric') ?? 'impressions'),
          });
    return Response.json(result, {
      headers: { 'Cache-Control': 'private,no-store' },
    });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: (e as Error & { status?: number }).status ?? 400 },
    );
  }
}
