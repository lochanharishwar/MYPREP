import type { ContentVersion, ReviewResult, Role } from './contracts';
export const REVIEW_THRESHOLD = 8.7;
export function reviewScore(
  input: Omit<ReviewResult, 'score' | 'passed' | 'attempt'>,
  attempt = 1,
): ReviewResult {
  const scores = [
    input.brandAlignment,
    input.psychology,
    input.visualQuality,
    input.platformFit,
  ];
  if (scores.some((n) => !Number.isFinite(n) || n < 1 || n > 10))
    throw new Error('Every review criterion must be between 1 and 10.');
  // Integer weights avoid decimal-weight drift at the 8.7 boundary.
  const score =
    (scores[0] * 35 + scores[1] * 25 + scores[2] * 20 + scores[3] * 20) / 100;
  return { ...input, score, passed: score >= REVIEW_THRESHOLD, attempt };
}
export function assertRole(role: Role, roles: Role[]) {
  if (!roles.includes(role))
    throw Object.assign(new Error('Your role cannot perform this action.'), {
      status: 403,
    });
}
export async function contentHash(
  value: Pick<
    ContentVersion,
    'caption' | 'assetPath' | 'platform' | 'format' | 'dnaId'
  >,
) {
  const canonical = JSON.stringify([
    value.caption,
    value.assetPath,
    value.platform,
    value.format,
    value.dnaId,
  ]);
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function normalizeUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.protocol !== 'http:')
    throw new Error('Only public HTTP and HTTPS websites are supported.');
  if (u.username || u.password || (u.port && !['80', '443'].includes(u.port)))
    throw new Error('Credentials and custom ports are not accepted.');
  const h = u.hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.test') ||
    !h.includes('.') ||
    h.includes(':') ||
    /^\d+(\.\d+){3}$/.test(h)
  )
    throw new Error('Use a public website domain.');
  u.hash = '';
  // Snapshot keys before mutating URLSearchParams.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const key of [...u.searchParams.keys()])
    if (key.startsWith('utm_') || ['fbclid', 'gclid'].includes(key))
      u.searchParams.delete(key);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/{2,}/g, '/');
  return u.toString().replace(/\/$/, '');
}
export function utcFromLocal(local: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error('Choose a date and time.');
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const target = local.replace('T', ' ');
  const base = Date.parse(local + 'Z');
  const candidates: number[] = [];
  // Search legal UTC offsets in 15-minute increments; reject DST gaps/overlaps explicitly.
  for (let mins = -840; mins <= 840; mins += 15) {
    const t = base + mins * 60000;
    if (formatter.format(new Date(t)) === target) candidates.push(t);
  }
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? 'This time occurs twice due to daylight saving. Choose another time.'
        : 'This local time does not exist. Choose another time.',
    );
  return new Date(candidates[0]).toISOString();
}
export function refreshDelay(ageMs: number) {
  return ageMs < 86400000
    ? 15 * 60
    : ageMs < 7 * 86400000
      ? 3600
      : ageMs < 30 * 86400000
        ? 86400
        : null;
}
export function safeRatio(n: number | null, d: number | null) {
  return n === null || d === null || d <= 0 ? null : n / d;
}
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.');
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const header = rows.shift()?.map((x) => x.trim().replace(/^\uFEFF/, ''));
  if (!header?.length || new Set(header).size !== header.length)
    throw new Error('CSV must contain unique column headers.');
  return rows.map((r, i) => {
    if (r.length !== header.length)
      throw new Error(`CSV row ${i + 2} has the wrong number of columns.`);
    return Object.fromEntries(header.map((h, j) => [h, r[j]]));
  });
}
