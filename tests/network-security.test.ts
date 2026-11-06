import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPublicAddress, isPublicWebUrl } from '@/lib/server/public-address';
import { validatePublicUrl } from '@/lib/server/security';
import { publicFetch } from '@/lib/server/public-fetch';
import { browserRequestGuard } from '@/lib/server/browser-request-guard';
import { boundedBytes } from '@/lib/server/http';
import { styles, visualStyleFallback } from '@/lib/server/providers';
import { reserve } from '@/lib/server/billing';
vi.mock('@/lib/server/billing', () => ({ reserve: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('public website network boundaries', () => {
  it.each(['0.0.0.0', '10.1.2.3', '127.1.2.3', '100.64.0.1', '100.127.255.254',
    '169.254.169.254', '172.31.255.255', '192.168.0.1', '192.0.0.8', '192.0.2.1',
    '192.88.99.1', '198.18.1.2', '198.51.100.1', '203.0.113.1', '224.0.0.1',
    '255.255.255.255', '999.1.1.1', '01.2.3.4', '::', '::1', 'fe80::1', 'fc00::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2001::1', '2001:db8::1',
    '2002:7f00:1::', '3fff::1', 'not-an-address'])('rejects reserved or malformed address %s', address => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(['1.1.1.1', '8.8.8.8', '93.184.216.34', '198.51.101.1', '203.0.114.1',
    '2606:4700:4700::1111', '2001:4860:4860::8888'])('allows public address %s', address => {
    expect(isPublicAddress(address)).toBe(true);
  });
  it.each(['http://2130706433', 'http://0x7f000001', 'http://127.1', 'http://[::1]',
    'http://[2606:4700::1111]', 'http://localhost.', 'http://a.local.', 'http://a.home.arpa',
    'http://metadata.internal', 'file:///etc/passwd', 'https://u:p@example.com',
    'https://example.com:8080', 'https://bad_host.example'])('rejects unsafe URL %s before DNS', async url => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(isPublicWebUrl(url)).toBe(false);
    await expect(validatePublicUrl(url)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('checks every A and AAAA answer, including mixed public/private records', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ Status: 0,
      Answer: [{ type: 1, data: '8.8.8.8' }, { type: 28, data: 'fc00::1' }] })));
    await expect(validatePublicUrl('https://example.com')).rejects.toThrow('Private');
  });
  it.each([{ Status: 3 }, { Status: 0, Answer: {} }, { Status: 0, Answer: [] },
    { Status: 0, Answer: [{ type: 28, data: '8.8.8.8' }] }])('fails closed for invalid DNS %j', async result => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(result)));
    await expect(validatePublicUrl('https://example.com')).rejects.toThrow();
  });
  it('bounds DNS responses before parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(64001))));
    await expect(validatePublicUrl('https://example.com')).rejects.toThrow('size');
  });
  it('rejects unsafe redirect destinations without fetching them', async () => {
    const fetcher = vi.fn(async (url: string) => url.includes('dns-query')
      ? Response.json({ Status: 0, Answer: [{ type: 1, data: '8.8.8.8' }] })
      : new Response(null, { status: 302, headers: { location: 'http://0x7f000001/private' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(publicFetch('https://example.com')).rejects.toThrow('public');
    expect(fetcher.mock.calls.filter(([url]) => !url.includes('dns-query')).map(([url]) => url)).toEqual(['https://example.com']);
  });
  it('cancels a response whose declared length exceeds the bound', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    await expect(boundedBytes(new Response(body, { headers: { 'content-length': '100' } }), 10)).rejects.toThrow('size');
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('rendered browser and screenshot safeguards', () => {
  it('requires configured network protection before DNS, billing or browser requests', async () => {
    vi.stubEnv('BROWSERLESS_EGRESS_PROTECTED', 'false');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(styles({} as Parameters<typeof styles>[0], 'https://example.com')).rejects.toThrow('network protection');
    expect(reserve).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('runs the serialized browser guard and blocks unsafe subresource URLs', async () => {
    let handle: (request: { url: () => string; continue: () => Promise<void>; abort: () => Promise<void> }) => void = () => {};
    const page = { setBypassServiceWorker: vi.fn(), setRequestInterception: vi.fn(),
      on: vi.fn((_event, handler) => { handle = handler; }) };
    await new Function('page', `return (async () => {${browserRequestGuard()}})()`)(page);
    expect(page.setBypassServiceWorker).toHaveBeenCalledWith(true);
    for (const url of ['http://[::1]', 'http://0x7f000001', 'https://service.local.', 'ftp://example.com', 'http://x.example:22']) {
      const request = { url: () => url, continue: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
      handle(request); expect(request.abort).toHaveBeenCalledOnce(); expect(request.continue).not.toHaveBeenCalled();
    }
    const request = { url: () => 'https://example.com/style.css', continue: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
    handle(request); expect(request.continue).toHaveBeenCalledOnce();
  });
  it('rejects non-image screenshots before a model or billing request', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('dns-query')
      ? Response.json({ Status: 0, Answer: [{ type: 1, data: '8.8.8.8' }] })
      : new Response('<html>untrusted</html>', { headers: { 'content-type': 'text/html' } })));
    await expect(visualStyleFallback({} as Parameters<typeof styles>[0],
      { screenshot: 'https://example.com/image', metadata: {} } as Parameters<typeof visualStyleFallback>[1])).rejects.toThrow('PNG');
    expect(reserve).not.toHaveBeenCalled();
  });
});
