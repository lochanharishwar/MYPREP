import { z } from 'zod';
import { boundedBytes } from '@/lib/server/http';
import { eventSchema } from '@/lib/contracts';
import { db, entity, rpc } from '@/lib/server/db';
import { decrypt, verifySignature } from '@/lib/server/security';
import { dispatch } from '@/lib/server/workflows';
import { apiFailure } from '@/lib/server/api-error';
export const dynamic = 'force-dynamic';
const input = z.object({ trackingId: z.uuid(), event: eventSchema }).strict();
const invalid = () => Object.assign(new Error('Invalid event request.'), { status: 400 });
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
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
      throw invalid();
    let bytes: Uint8Array;
    try {
      bytes = await boundedBytes(request, 64000);
    } catch {
      throw Object.assign(new Error('Invalid or oversized event payload.'), {
        status: 413,
      });
    }
    let raw: string;
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw invalid();
    }
    const body = input.parse(JSON.parse(raw));
    const tracking = await entity<{ enabled: boolean }>(
      body.trackingId,
      undefined,
      'tracking_secret',
    );
    if (!tracking.payload.enabled) throw invalid();
    const { data: brand, error: brandError } = await db()
      .from('brands')
      .select('website')
      .eq('id', tracking.brand_id)
      .eq('workspace_id', tracking.workspace_id)
      .single();
    if (brandError) throw brandError;
    if (!brand) throw invalid();
    const origin = request.headers.get('origin');
    const signature = request.headers.get('x-signature');
    let source = 'browser';
    if (request.headers.has('x-signature')) {
      const timestamp = request.headers.get('x-timestamp') ?? '';
      if (
        !signature || !/^[a-f0-9]{64}$/i.test(signature) ||
        !/^\d{10}$/.test(timestamp) ||
        !Number.isSafeInteger(Number(timestamp)) ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
      )
        throw invalid();
      const { data, error: credentialError } = await db()
        .from('credentials')
        .select('encrypted')
        .eq('entity_id', tracking.id)
        .single();
      if (credentialError) throw credentialError;
      if (
        !data ||
        !(await verifySignature(
          timestamp + '.' + raw,
          signature,
          await decrypt<string>(data.encrypted),
        ))
      )
        throw invalid();
      source = 'server';
    } else if (origin !== new URL(brand.website).origin)
      throw invalid();
    const allowed = await rpc<boolean>('consume_ingest_limit', {
      p_key:
        tracking.id + ':' + source +
        ':' +
        (request.headers.get('cf-connecting-ip') ?? 'unknown'),
      p_max: 120,
    });
    if (!allowed)
      return Response.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    const event = body.event;
    if (
      source === 'browser' &&
      (['purchase', 'refund', 'identify'].includes(event.type) ||
        event.customerId ||
        event.accountId ||
        event.amount !== undefined || event.currency !== undefined || event.orderId !== undefined)
    )
      throw invalid();
    // Reserve a separate idempotency namespace for untrusted browser events.
    // They must never occupy the key of a later verified purchase/refund.
    if (source === 'server' && event.eventId.startsWith('browser:')) throw invalid();
    if (Date.parse(event.occurredAt) > Date.now() + 300000)
      throw invalid();
    if (event.campaignId) {
      const campaign = await entity(event.campaignId, tracking.workspace_id, 'campaign');
      if (campaign.brand_id !== tracking.brand_id) throw invalid();
    }
    const { data: inserted, error } = await db().from('journey_events').upsert(
      {
        workspace_id: tracking.workspace_id,
        brand_id: tracking.brand_id,
        event_id: source === 'browser' ? `browser:${event.eventId}` : event.eventId,
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
    ).select('id');
    if (error) throw error;
    if (source === 'server' && inserted?.length)
      await dispatch('brand/insights', {
        workspaceId: tracking.workspace_id,
        brandId: tracking.brand_id,
      }).catch(() => {});
    return Response.json(
      { accepted: true },
      {
        status: 202,
        headers: {
          'Cache-Control': 'no-store',
          ...(origin && origin === new URL(brand.website).origin
            ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
            : {}),
        },
      },
    );
  } catch (e) {
    return apiFailure(e, 'collect');
  }
}
