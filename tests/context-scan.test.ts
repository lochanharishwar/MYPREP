import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextScanBatch } from '@/lib/server/context-scan';
import { contextDiscover, contextScrape } from '@/lib/server/context-client';
const state = vi.hoisted(() => ({ row: null as any }));
vi.mock('@/lib/server/security', () => ({ validatePublicUrl: async (url: string) => url }));
vi.mock('@/lib/server/scan-ledger', () => ({
  creditMonth: () => '2026-11',
  createScan: async (site: string, payload: unknown) => { state.row = {site, payload: JSON.stringify(payload)}; return 'run'; },
  claimScan: async () => state.row,
  saveScan: async (_id: string, payload: unknown) => { state.row.payload = JSON.stringify(payload); },
}));
vi.mock('@/lib/server/context-client', () => ({ contextDiscover: vi.fn(), contextScrape: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); state.row = null;
  vi.mocked(contextDiscover).mockResolvedValue({ urls: ['https://example.com', 'https://example.com/about', 'https://example.com/products'], partial: false });
  vi.mocked(contextScrape).mockImplementation(async (_ctx, url) => ({ url, html: `<html><title>Example</title><body><h1>${url}</h1><p>Our tools are made for gardeners and feature replaceable wooden handles.</p></body></html>`, markdown:'Our gardening tools', links:[], metadata:{provider:'context.dev',retrievedAt:'2026-11-12',partial:false} } as any));
});
describe('persisted Context page queue', () => {
  it('summarizes paragraph text from a complete HTML document without serializing observation objects', async () => {
    vi.mocked(contextScrape).mockResolvedValueOnce({
      url: 'https://example.com',
      html: '<!doctype html><html><head><title>Garden tools</title></head><body><main><p>Our tools are made for gardeners and feature replaceable wooden handles.</p><p>Repair guides explain how to replace worn parts and maintain your tools.</p></main></body></html>',
      markdown: '', links: [], metadata: { provider: 'context.dev', retrievedAt: '2026-11-13', partial: false },
    } as any);
    const result = await contextScanBatch('https://example.com');
    expect(result.pages[0].summary.summary).toBe('Our tools are made for gardeners and feature replaceable wooden handles. Repair guides explain how to replace worn parts and maintain your tools.');
    expect(result.pages[0].summary.summary).not.toContain('[object Object]');
  });
  it('reads each discovered page once and retains a summary and evidence for every success', async () => {
    let result = await contextScanBatch('https://example.com');
    expect(result.continueScan).toBe(true);
    result = await contextScanBatch('https://example.com', result.runId);
    result = await contextScanBatch('https://example.com', result.runId);
    expect(result.continueScan).toBe(false);
    expect(result.pages).toHaveLength(3);
    expect(result.pages.every(p => p.summary.summary.includes('gardeners') && p.evidence.length)).toBe(true);
    expect(contextScrape).toHaveBeenCalledTimes(3);
    expect(contextDiscover).toHaveBeenCalledOnce();
  });
  it('keeps pending URLs and earlier summaries when credits run out', async () => {
    const initial = await contextScanBatch('https://example.com');
    vi.mocked(contextScrape).mockRejectedValue(new Error('Context credit limit reached'));
    const result = await contextScanBatch('https://example.com', initial.runId);
    expect(result.continueScan).toBe(false);
    expect(result.pages).toHaveLength(1);
    expect(result.scan.queue).toHaveLength(2);
    expect(result.scan.failed).toHaveLength(0);
  });
  it('records an inaccessible page and continues to the next discovered URL', async () => {
    const initial = await contextScanBatch('https://example.com');
    vi.mocked(contextScrape).mockRejectedValueOnce(new Error('HTTP 403'));
    const result = await contextScanBatch('https://example.com', initial.runId);
    expect(result.scan.failed).toEqual(['https://example.com/about']);
    expect(result.continueScan).toBe(true);
  });
  it('pauses on rate limits without marking pending pages as failed', async () => {
    const initial = await contextScanBatch('https://example.com');
    vi.mocked(contextScrape).mockRejectedValueOnce(new Error('Context.dev request failed (429). Check key access, credits and rate limits.'));
    const result = await contextScanBatch('https://example.com', initial.runId);
    expect(result.continueScan).toBe(false);
    expect(result.scan.queue).toHaveLength(2);
    expect(result.scan.failed).toHaveLength(0);
    expect(result.pages).toHaveLength(1);
  });
  it('does not dispatch page requests after an account-wide discovery failure', async () => {
    vi.mocked(contextDiscover).mockRejectedValueOnce(new Error('Context.dev request failed (402). Check key access, credits and rate limits.'));
    const result = await contextScanBatch('https://example.com');
    expect(result.continueScan).toBe(false);
    expect(contextScrape).not.toHaveBeenCalled();
    expect(result.scan.queue).toHaveLength(1);
  });
});
