import 'server-only';
// A shared persistent ledger, never a browser-supplied spending counter.
const schema = `CREATE TABLE IF NOT EXISTS context_scans (id TEXT PRIMARY KEY, month TEXT NOT NULL, site TEXT NOT NULL, credits INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL)`;
let local: Promise<any> | undefined;
// Compress repeated URL inventories without dropping evidence needed to resume.
async function encode(payload: unknown) {
  const input = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = new Uint8Array(await new Response(new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary = '';
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return 'gz:' + btoa(binary);
}
async function decode(payload: string) {
  if (!payload.startsWith('gz:')) return payload;
  const bytes = Uint8Array.from(atob(payload.slice(3)), c => c.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
async function database(): Promise<{ prepare: (sql: string) => any }> {
  if (process.env.NODE_ENV === 'production') {
    const { env } = await import('cloudflare:workers');
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('Context scanning needs the persistent credit ledger. Deployment must provision the DB binding.');
    return db;
  }
  local ??= (async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { mkdirSync } = await import('node:fs');
    mkdirSync('.wrangler', { recursive: true });
    const db = new DatabaseSync('.wrangler/context-scans.sqlite');
    db.exec(schema);
    return { prepare: (sql: string) => ({ bind: (...values: unknown[]) => ({
      first: async () => db.prepare(sql).get(...values as any[]) ?? null,
      run: async () => ({ meta: { changes: db.prepare(sql).run(...values as any[]).changes } }),
    }) }) };
  })();
  return local;
}
export function creditMonth(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
}
export async function createScan(site: string, payload: unknown) {
  const id = crypto.randomUUID();
  const month = creditMonth();
  const created = await (await database()).prepare(`INSERT INTO context_scans (id,month,site,payload) SELECT ?,?,?,? WHERE
    (SELECT COALESCE(SUM(credits),0) FROM context_scans WHERE month=?)<1000 AND
    (SELECT COALESCE(SUM(credits),0) FROM context_scans WHERE month=? AND site=?)<50 AND
    (SELECT COUNT(*) FROM context_scans WHERE month=?)<1000`).bind(id, month, site, await encode(payload), month, month, site, month).run();
  if (!created.meta.changes) throw new Error('Context credit limit reached: 50 per website and 1,000 per month. Saved pages remain available.');
  return id;
}
export async function claimScan(id: string) {
  const db = await database();
  const claimed = await db.prepare('UPDATE context_scans SET locked_until=? WHERE id=? AND locked_until<?').bind(Date.now()+240000, id, Date.now()).run();
  if (!claimed.meta.changes) throw new Error('Scan is already running or unavailable. Wait before continuing.');
  const row = await db.prepare('SELECT * FROM context_scans WHERE id=?').bind(id).first();
  return { ...row, payload: await decode(row.payload) };
}
export async function saveScan(id: string, payload: unknown) {
  await (await database()).prepare('UPDATE context_scans SET payload=?,locked_until=0 WHERE id=?').bind(await encode(payload), id).run();
}
export async function reserveScanCredit(id: string) {
  const month = creditMonth();
  // One SQLite statement serializes both checks with the increment. Per-site
  // monthly cap prevents restarting a scan to evade the 50-credit allowance.
  const result = await (await database()).prepare(`UPDATE context_scans SET credits=credits+1 WHERE id=? AND month=? AND
    (SELECT COALESCE(SUM(credits),0) FROM context_scans WHERE month=?)<1000 AND
    (SELECT COALESCE(SUM(b.credits),0) FROM context_scans b WHERE b.month=? AND b.site=context_scans.site)<50`).bind(id, month, month, month).run();
  if (!result.meta.changes) throw new Error('Context credit limit reached: 50 per website and 1,000 per month. Saved pages remain available.');
}
