import { z } from 'zod';
import { crawlWebsite } from '@/lib/server/local-crawl';
import { assertRequestActive, beginLocalOperation, localBody, localFailure } from '@/lib/server/local-request';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  let streaming = false;
  try {
    const input = z
      .object({ url: z.string().min(1).max(2000) })
      .parse(await localBody(request, true));
    assertRequestActive(request);
    release = beginLocalOperation('scan');
    if (request.headers.get('accept')?.includes('application/x-ndjson')) {
      const encoder = new TextEncoder();
      let closed = false;
      streaming = true;
      const stream = new ReadableStream({
        async start(controller) {
          const send = (value: unknown) => {
            if (!closed)
              controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
          };
          try {
            const result = await crawlWebsite(input.url, (result) =>
              send({ type: 'progress', result }),
            );
            send({ type: 'complete', result });
          } catch (error) {
            send({
              type: 'error',
              error:
                error instanceof Error
                  ? error.message
                  : 'Website scan could not finish.',
            });
          } finally {
            // Cancelling a response does not finish the crawl. Keep its lease
            // until the work actually settles, so cancellation cannot bypass it.
            release?.();
            if (!closed) {
              closed = true;
              controller.close();
            }
          }
        },
        cancel() {
          closed = true;
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-store, no-transform',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    return Response.json(await crawlWebsite(input.url), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return localFailure(error);
  } finally {
    if (!streaming) release?.();
  }
}
