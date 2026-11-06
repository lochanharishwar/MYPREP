import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  entity: vi.fn(), rpc: vi.fn(), upsert: vi.fn(), result: vi.fn(), dispatch: vi.fn(),
  decrypt: vi.fn(), verifySignature: vi.fn(), db: vi.fn(),
}));
vi.mock('@/lib/server/db', () => ({ entity: mocks.entity, rpc: mocks.rpc, db: mocks.db }));
vi.mock('@/lib/server/security', () => ({ decrypt: mocks.decrypt, verifySignature: mocks.verifySignature }));
vi.mock('@/lib/server/workflows', () => ({ dispatch: mocks.dispatch }));
import { POST } from '@/app/api/collect/route';

const trackingId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const tracking = { id: trackingId, workspace_id: 'workspace', brand_id: 'brand', payload: {enabled: true} };
const baseEvent = { eventId: 'external-event-1', occurredAt: '2026-10-01T12:00:00Z', type: 'page_view', anonymousId: 'visitor' };
const request = (event: object = baseEvent, signed = false, headers = {}) => new Request('https://app.example/api/collect', {
  method: 'POST',
  headers: {
    'content-type': 'application/json', origin: 'https://brand.example',
    ...(signed ? { 'x-signature': 'a'.repeat(64), 'x-timestamp': String(Math.floor(Date.now()/1000)) } : {}),
    ...headers,
  },
  body: JSON.stringify({ trackingId, event }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.entity.mockImplementation(async (id: string) => id === trackingId ? tracking : {id, brand_id: 'brand'});
  mocks.rpc.mockResolvedValue(true);
  mocks.decrypt.mockResolvedValue('fixture');
  mocks.verifySignature.mockResolvedValue(true);
  mocks.dispatch.mockResolvedValue(undefined);
  mocks.result.mockResolvedValue({data: [{id: 'inserted'}], error: null});
  mocks.upsert.mockReturnValue({select: mocks.result});
  mocks.db.mockImplementation(() => ({ from: (table: string) => {
    if (table === 'journey_events') return {upsert: mocks.upsert};
    const query = {
      select: () => query, eq: () => query,
      single: async () => ({data: table === 'brands' ? {website: 'https://brand.example'} : {encrypted: 'envelope'}}),
    };
    return query;
  }}));
});

describe('public event ingestion trust boundaries', () => {
  it('keeps browser idempotency keys separate from verified webhook IDs', async () => {
    expect((await POST(request())).status).toBe(202);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({event_id: 'browser:external-event-1', source: 'browser'});
    expect((await POST(request({...baseEvent, type:'purchase', amount: 20, currency:'USD', orderId:'order'}, true))).status).toBe(202);
    expect(mocks.upsert.mock.calls[1][0]).toMatchObject({event_id: 'external-event-1', source: 'server'});
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });
  it('does not dispatch another insights job for a replayed signed event', async () => {
    mocks.result.mockResolvedValue({data: [], error: null});
    const response = await POST(request(baseEvent, true));
    expect(response.status).toBe(202);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('reserves the browser ID namespace from signed webhook inputs', async () => {
    expect((await POST(request({...baseEvent, eventId:'browser:external-event-1'}, true))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('rejects campaign references from a different brand before writing', async () => {
    mocks.entity.mockImplementation(async (id: string) => id === trackingId ? tracking : {id, brand_id:'other-brand'});
    expect((await POST(request({...baseEvent, campaignId}))).status).toBe(400);
    expect(mocks.entity).toHaveBeenCalledWith(campaignId, 'workspace', 'campaign');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each([{amount:0}, {currency:'USD'}, {orderId:'order'}, {customerId:'customer'}, {accountId:'account'}])(
    'rejects unverified monetary and customer fields %j', async (fields) => {
      expect((await POST(request({...baseEvent,...fields}))).status).toBe(400);
      expect(mocks.upsert).not.toHaveBeenCalled();
    },
  );
  it('rejects a wrong origin or invalid signature before inserting', async () => {
    expect((await POST(request(baseEvent, false, {origin:'https://untrusted.example'}))).status).toBe(400);
    mocks.verifySignature.mockResolvedValue(false);
    expect((await POST(request(baseEvent, true))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each(['', 'invalid', 'a'.repeat(65)])('rejects a malformed supplied signature %j instead of downgrading to browser', async (signature) => {
    expect((await POST(request(baseEvent, true, {'x-signature':signature}))).status).toBe(400);
    expect(mocks.verifySignature).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('rejects expired signed timestamps before verification or writes', async () => {
    const timestamp=String(Math.floor(Date.now()/1000)-301);
    expect((await POST(request(baseEvent, true, {'x-timestamp':timestamp}))).status).toBe(400);
    expect(mocks.verifySignature).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not accept browser claims of a trusted source or purchase', async () => {
    const event={...baseEvent,source:'server',type:'purchase',amount:20,currency:'USD',orderId:'order'};
    expect((await POST(request(event))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('keeps browser and signed rate-limit keys separate', async () => {
    await POST(request());
    await POST(request(baseEvent,true));
    expect(mocks.rpc.mock.calls[0][1].p_key).toBe(`${trackingId}:browser:unknown`);
    expect(mocks.rpc.mock.calls[1][1].p_key).toBe(`${trackingId}:server:unknown`);
  });
  it('does not write or enqueue work when the rate limit is reached', async () => {
    mocks.rpc.mockResolvedValue(false);
    expect((await POST(request(baseEvent,true))).status).toBe(429);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('rejects events beyond the permitted clock skew', async () => {
    const event={...baseEvent,occurredAt:new Date(Date.now()+360000).toISOString()};
    expect((await POST(request(event,true))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('rejects oversized event bodies before database work', async () => {
    expect((await POST(request({...baseEvent,properties:{payload:'x'.repeat(64000)}}))).status).toBe(413);
    expect(mocks.entity).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON without reflecting the body', async () => {
    const response=await POST(new Request('https://app.example/api/collect',{
      method:'POST',headers:{'content-type':'application/json'},body:'{"secret":"private-value"',
    }));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('private-value');
    expect(mocks.entity).not.toHaveBeenCalled();
  });
  it('does not reflect database credentials or SQL in error responses', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.result.mockResolvedValue({data: null,error: new Error('private database credential')});
      const response = await POST(request());
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('private database credential');
    } finally { logger.mockRestore(); }
  });
  it.each(['brands', 'credentials'])('fails closed when a %s lookup returns data with an error', async (failedTable) => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.db.mockImplementation(() => ({ from: (table: string) => {
      const query = {
        select: () => query, eq: () => query,
        single: async () => ({
          data: table === 'brands' ? { website: 'https://brand.example' } : { encrypted: 'envelope' },
          error: table === failedTable ? new Error('private database detail') : null,
        }),
      };
      return query;
    }}));
    try {
      const response = await POST(request(baseEvent, true));
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('private database detail');
      expect(mocks.verifySignature).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
    } finally { logger.mockRestore(); }
  });
  it('rejects non-JSON content before database work', async () => {
    expect((await POST(request(baseEvent, false, {'content-type':'text/plain'}))).status).toBe(400);
    expect(mocks.entity).not.toHaveBeenCalled();
  });
});
