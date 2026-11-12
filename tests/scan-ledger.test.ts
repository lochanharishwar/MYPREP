import { beforeEach, describe, expect, it, vi } from 'vitest';
const { DatabaseSync } = await vi.importActual<typeof import('node:sqlite')>('node:sqlite');
const memory = new DatabaseSync(':memory:');
vi.mock('node:sqlite', () => ({ DatabaseSync: class { constructor() { return memory; } } }));
import { createScan, claimScan, saveScan, reserveScanCredit, creditMonth } from '@/lib/server/scan-ledger';
beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  if (!memory.prepare("SELECT name FROM sqlite_master WHERE name='context_scans'").get()) await createScan('initialize.example', {});
  memory.exec('DELETE FROM context_scans');
});
describe('Context credit ledger', () => {
  it('reserves exactly 50 per site across repeated scan IDs', async () => {
    const id = await createScan('brand.example', {});
    for (let i=0;i<50;i++) await reserveScanCredit(id);
    await expect(reserveScanCredit(id)).rejects.toThrow('credit limit');
    await expect(createScan('brand.example', {})).rejects.toThrow('credit limit');
  });
  it('enforces the shared 1000 monthly ceiling across sites', async () => {
    const id = await createScan('one.example', {});
    memory.prepare('UPDATE context_scans SET credits=1000 WHERE id=?').run(id);
    await expect(createScan('another.example', {})).rejects.toThrow('credit limit');
  });
  it('never over-reserves when competing requests reach the site limit together', async () => {
    const first = await createScan('brand.example', {});
    const second = await createScan('brand.example', {});
    const results = await Promise.allSettled(Array.from({ length: 70 }, (_, i) => reserveScanCredit(i % 2 ? first : second)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(50);
    expect(memory.prepare('SELECT SUM(credits) AS used FROM context_scans').get()?.used).toBe(50);
  });
  it('serializes scan requests and keeps saved state after releasing the lease', async () => {
    const id = await createScan('brand.example', { queue: ['one'] });
    await claimScan(id);
    await expect(claimScan(id)).rejects.toThrow('already running');
    await saveScan(id, { queue: ['two'] });
    expect(JSON.parse((await claimScan(id)).payload)).toEqual({ queue: ['two'] });
  });
  it('uses the Indian calendar month at the boundary', () => {
    expect(creditMonth(new Date('2026-11-30T18:31:00Z'))).toBe('2026-12');
  });
});
