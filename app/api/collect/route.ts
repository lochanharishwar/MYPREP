import { z } from 'zod';
import { boundedBytes } from '@/lib/server/http';
import { eventSchema } from '@/lib/contracts';
import { db, entity, rpc } from '@/lib/server/db';
import { decrypt, verifySignature } from '@/lib/server/security';
import { dispatch } from '@/lib/server/workflows';
export const dynamic = 'force-dynamic';
export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin') ?? '';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    },
  });
}
export async function POST(request: Request) {
  try {
    const raw = new TextDecoder().decode(await boundedBytes(request, 64000));
    if (raw.length > 64000) throw new Error('Event payload is too large.');
    const body = JSON.parse(raw);
    const tracking = await entity<{ enabled: boolean }>(
      z.uuid().parse(body.trackingId),
      undefined,
      'tracking_secret',
    );
    if (!tracking.payload.enabled) throw new Error('Tracking is disabled.');
    const { data: brand } = await db()
      .from('brands')
      .select('website')
      .eq('id', tracking.brand_id)
      .single();
    if (!brand) throw new Error('Brand not found.');
    const origin = request.headers.get('origin');
    const signature = request.headers.get('x-signature');
    let source = 'browser';
    if (signature) {
      const timestamp = request.headers.get('x-timestamp') ?? '';
      if (
        !/^\d{10}$/.test(timestamp) ||
        !Number.isSafeInteger(Number(timestamp)) ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
      )
        throw new Error('Webhook timestamp expired.');
      const { data } = await db()
        .from('credentials')
        .select('encrypted')
        .eq('entity_id', tracking.id)
        .single();
      if (
        !data ||
        !(await verifySignature(
          timestamp + '.' + raw,
          signature,
          await decrypt<string>(data.encrypted),
        ))
      )
        throw new Error('Invalid signature.');
      source = 'server';
    } else if (origin !== new URL(brand.website).origin)
      throw new Error('Origin is not allowed.');
    const allowed = await rpc<boolean>('consume_ingest_limit', {
      p_key:
        tracking.id +
        ':' +
        (request.headers.get('cf-connecting-ip') ?? 'unknown'),
      p_max: 120,
    });
    if (!allowed)
      return Response.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    const event = eventSchema.parse(body.event);
    if (
      source === 'browser' &&
      (['purchase', 'refund', 'identify'].includes(event.type) ||
        event.customerId ||
        event.accountId ||
        event.amount !== undefined)
    )
      throw new Error(
        'Verified customer and revenue events require a signed server webhook.',
      );
    if (Date.parse(event.occurredAt) > Date.now() + 300000)
      throw new Error('Event timestamp is in the future.');
    const { error } = await db().from('journey_events').upsert(
      {
        workspace_id: tracking.workspace_id,
        brand_id: tracking.brand_id,
        event_id: event.eventId,
        occurred_at: event.occurredAt,
        type: event.type,
        anonymous_id: event.anonymousId,
        customer_id: event.customerId,
        account_id: event.accountId,
        campaign_id: event.campaignId,
        channel: event.channel,
        amount: event.amount,
        currency: event.currency,
        order_id: event.orderId,
        source,
        properties: event.properties,
      },
      { onConflict: 'brand_id,event_id', ignoreDuplicates: true },
    );
    if (error) throw error;
    if (source === 'server')
      await dispatch('brand/insights', {
        workspaceId: tracking.workspace_id,
        brandId: tracking.brand_id,
      }).catch(() => {});
    return Response.json(
      { accepted: true },
      {
        status: 202,
        headers: origin
          ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
          : {},
      },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
