import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertLocalRequest, beginLocalOperation } from '@/lib/server/local-request';
import { POST as generate } from '@/app/api/local/generate/route';
import { POST as scan } from '@/app/api/local/scan/route';
import { POST as probe } from '@/app/api/local/provider-check/route';

const doubles = vi.hoisted(() => ({ text: vi.fn(), image: vi.fn(), scan: vi.fn(), probe: vi.fn() }));
vi.mock('@/lib/server/gemini-client', async (original) => ({
  ...(await original<typeof import('@/lib/server/gemini-client')>()),
  geminiText: doubles.text, geminiImage: doubles.image, checkGeminiConnection: doubles.probe,
}));
vi.mock('@/lib/server/local-crawl', () => ({ crawlWebsite: doubles.scan }));

const brief = {
  idea: 'Show a bicycle on the daily commute', formats: ['image'], platforms: ['instagram'], budget: 10,
  brand: { name: 'Cycle', tagline: null, overview: [{ text: 'Bicycles for commuting' }], palette: [] },
};
const review = JSON.stringify({ brandAlignment: 9, psychology: 9, visualQuality: 9, platformFit: 9, feedback: [] });
const request = (path: string, body: unknown, init: RequestInit = {}) => new Request(`http://localhost:3000/api/local/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GEMINI_API_KEY', 'test-fixture-key');
  vi.stubEnv('GEMINI_TEXT_MODEL', 'gemini-3.1-pro-preview');
  vi.stubEnv('GEMINI_REVIEW_MODEL', 'gemini-3.1-pro-preview');
  vi.stubEnv('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image');
  vi.stubEnv('COST_TEXT', '');
  vi.stubEnv('COST_IMAGE', '');
  doubles.image.mockResolvedValue({ mimeType: 'image/png', data: 'Zml4dHVyZQ==' });
  doubles.text.mockResolvedValueOnce('A bicycle for your daily commute.').mockResolvedValueOnce(review);
});
afterEach(() => vi.unstubAllEnvs());

describe('local processing request boundaries', () => {
  it.each(['text/plain;application/json', 'application/jsonp', 'application/json-malformed'])('rejects misleading content type %s', async (type) => {
    const response = await generate(request('generate', brief, { headers: { 'content-type': type } }));
    expect(response.status).toBe(415);
    expect(doubles.text).not.toHaveBeenCalled();
  });
  it('accepts JSON media types case-insensitively with a charset', () => {
    expect(() => assertLocalRequest(request('scan', {}, { headers: { 'content-type': 'Application/JSON; charset=utf-8' } }))).not.toThrow();
  });
  it.each([
    { format: 'image', platform: 'instagram', budget: 1.84 },
    { format: 'text', platform: 'x', budget: 0.51 },
  ])('rejects a $budget $format budget just below the server reservation', async ({ format, platform, budget }) => {
    const response = await generate(request('generate', { ...brief, formats: [format], platforms: [platform], budget }));
    expect(response.status).toBe(400);
    expect(doubles.text).not.toHaveBeenCalled();
    expect(doubles.image).not.toHaveBeenCalled();
  });
  it.each([
    { format: 'image', platform: 'instagram', budget: 1.85 },
    { format: 'text', platform: 'x', budget: 0.52 },
  ])('allows an exact $budget $format reservation', async ({ format, platform, budget }) => {
    const response = await generate(request('generate', { ...brief, formats: [format], platforms: [platform], budget }));
    expect(response.status).toBe(200);
    expect(doubles.text).toHaveBeenCalledTimes(2);
    expect(doubles.image).toHaveBeenCalledTimes(format === 'image' ? 1 : 0);
  });
  it('uses server-configured costs instead of a client-supplied reservation', async () => {
    vi.stubEnv('COST_TEXT', '1');
    vi.stubEnv('COST_IMAGE', '2');
    const response = await generate(request('generate', { ...brief, budget: 3.99, textCost: 0.01, imageCost: 0.01 }));
    expect(response.status).toBe(400);
    expect(doubles.text).not.toHaveBeenCalled();
    expect(doubles.image).not.toHaveBeenCalled();
  });
  it('does not start any provider work for an already cancelled request', async () => {
    const lifecycle = new AbortController();
    lifecycle.abort();
    expect((await generate(request('generate', brief, { signal: lifecycle.signal }))).status).toBe(409);
    expect(doubles.text).not.toHaveBeenCalled();
    expect(doubles.image).not.toHaveBeenCalled();
  });
  it('stops before image and review when the request is cancelled after its caption', async () => {
    const lifecycle = new AbortController();
    doubles.text.mockReset().mockImplementation(async () => { lifecycle.abort(); return 'Caption'; });
    const response = await generate(request('generate', brief, { signal: lifecycle.signal }));
    expect(response.status).toBe(409);
    expect(doubles.text).toHaveBeenCalledTimes(1);
    expect(doubles.image).not.toHaveBeenCalled();
    // Failure releases its slot for the next request.
    const release = beginLocalOperation('generation');
    release();
  });
  it('stops before review when cancellation happens during image generation', async () => {
    const lifecycle = new AbortController();
    doubles.image.mockImplementation(async () => {
      lifecycle.abort();
      return { mimeType: 'image/png', data: 'Zml4dHVyZQ==' };
    });
    const input = request('generate', brief, { signal: lifecycle.signal });
    const response = await generate(input);
    expect(response.status).toBe(409);
    expect(doubles.text).toHaveBeenCalledTimes(1);
    expect(doubles.image).toHaveBeenCalledTimes(1);
    expect(doubles.image.mock.calls[0].at(-1)).toBe(input.signal);
    const release = beginLocalOperation('generation');
    release();
  });
  it('rejects concurrent generation before it can multiply paid provider calls', async () => {
    const caption = deferred<string>();
    doubles.text.mockReset().mockReturnValueOnce(caption.promise).mockResolvedValue(review);
    const first = generate(request('generate', brief));
    try {
      await vi.waitFor(() => expect(doubles.text).toHaveBeenCalledTimes(1));
      const second = await generate(request('generate', brief));
      expect(second.status).toBe(429);
      expect(second.headers.get('retry-after')).toBe('10');
      expect(doubles.text).toHaveBeenCalledTimes(1);
    } finally { caption.resolve('Caption'); }
    expect((await first).status).toBe(200);
    const release = beginLocalOperation('generation');
    release();
  });
  it('keeps a cancelled generation slot occupied until dispatched work settles', async () => {
    const lifecycle = new AbortController();
    const caption = deferred<string>();
    doubles.text.mockReset().mockReturnValueOnce(caption.promise);
    const first = generate(request('generate', brief, { signal: lifecycle.signal }));
    try {
      await vi.waitFor(() => expect(doubles.text).toHaveBeenCalledTimes(1));
      lifecycle.abort();
      expect((await generate(request('generate', brief))).status).toBe(429);
      expect(doubles.text).toHaveBeenCalledTimes(1);
    } finally { caption.resolve('Caption'); }
    expect((await first).status).toBe(409);
    expect(doubles.image).not.toHaveBeenCalled();
    const release = beginLocalOperation('generation');
    release();
  });
  it('retains a cancelled streaming scan slot until the crawl actually finishes', async () => {
    const crawling = deferred<object>();
    doubles.scan.mockReturnValue(crawling.promise);
    const first = await scan(request('scan', { url: 'https://example.com' }, { headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' } }));
    await first.body?.cancel();
    const second = scan(request('scan', { url: 'https://example.com' }));
    try {
      await vi.waitFor(() => expect(doubles.scan).toHaveBeenCalledTimes(2));
      expect((await scan(request('scan', { url: 'https://example.com' }))).status).toBe(429);
    } finally { crawling.resolve({ pages: [], scan: { status: 'partial' } }); }
    expect((await second).status).toBe(200);
    const releaseOne = beginLocalOperation('scan'), releaseTwo = beginLocalOperation('scan');
    releaseOne(); releaseTwo();
  });
  it('bounds simultaneous provider checks and releases the slot after an error', async () => {
    const pending = deferred<never>();
    doubles.probe.mockReturnValue(pending.promise);
    const first = probe(request('provider-check', {}));
    try {
      await vi.waitFor(() => expect(doubles.probe).toHaveBeenCalledTimes(1));
      expect((await probe(request('provider-check', {}))).status).toBe(429);
    } finally {
      // Resolving the awaited work permits release, even when no result was returned.
      pending.resolve(undefined as never);
    }
    await first;
    doubles.probe.mockRejectedValueOnce(new Error('Fixture failure'));
    expect((await probe(request('provider-check', {}))).status).toBe(502);
    const release = beginLocalOperation('provider-check');
    release();
  });
  it('releases a generation slot after provider failure', async () => {
    doubles.text.mockReset().mockRejectedValueOnce(new Error('Fixture provider failure'));
    expect((await generate(request('generate', brief))).status).toBe(502);
    const release = beginLocalOperation('generation');
    release();
  });
  it('releases a non-streaming scan slot after a crawler failure', async () => {
    doubles.scan.mockRejectedValueOnce(new Error('Fixture crawler failure'));
    expect((await scan(request('scan', { url: 'https://example.com' }))).status).toBe(502);
    const releaseOne = beginLocalOperation('scan'), releaseTwo = beginLocalOperation('scan');
    releaseOne(); releaseTwo();
  });
  it('releases each lease at most once', () => {
    const first = beginLocalOperation('generation');
    first(); first();
    const second = beginLocalOperation('generation');
    expect(() => beginLocalOperation('generation')).toThrow('already working');
    second();
  });
});
