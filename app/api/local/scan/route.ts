import { z } from 'zod';
import { crawlWebsite } from '@/lib/server/local-crawl';
import { localBody, localFailure } from '@/lib/server/local-request';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const input = z
      .object({ url: z.string().min(1).max(2000) })
      .parse(await localBody(request));
    return Response.json(await crawlWebsite(input.url), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return localFailure(error);
  }
}
