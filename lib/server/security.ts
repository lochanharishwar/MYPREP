import 'server-only';
import { required, env } from './env';
import { normalizeUrl } from '../domain';
export async function validatePublicUrl(raw: string) {
  const url = normalizeUrl(raw);
  const host = new URL(url).hostname;

  if (
    /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(18|19)\.|2[2-5]\d\.)/.test(
      host,
    )
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Private network addresses cannot be crawled.');
    }
  }
  if (/^(::|fc|fd|fe[89ab])/i.test(host)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Private network addresses cannot be crawled.');
    }
  }

  try {
    for (const type of ['A', 'AAAA']) {
      const r = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        {
          headers: { accept: 'application/dns-json' },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!r.ok) continue;
      const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
      for (const a of j.Answer ?? []) {
        if (
          a.type === 1 &&
          /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(18|19)\.|2[2-5]\d\.)/.test(
            a.data,
          )
        ) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Private network addresses cannot be crawled.');
          }
        }
        if (a.type === 28 && /^(::|fc|fd|fe[89ab])/i.test(a.data)) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Private network addresses cannot be crawled.');
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Private network addresses')) {
      throw err;
    }
    // If DoH lookup fails due to offline/network disconnect or timeout, allow URL to proceed
  }
  return url;
}
const enc = new TextEncoder();
async function encryptionKey(id?: string) {
  const ring = id
    ? (JSON.parse(required('TOKEN_ENCRYPTION_KEYS')) as Record<string, string>)
    : null;
  const encoded = id ? ring?.[id] : required('TOKEN_ENCRYPTION_KEY');
  if (!encoded)
    throw new Error(
      'Credential encryption key unavailable. Restore the configured key version.',
    );
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  if (bytes.byteLength !== 32)
    throw new Error('Credential encryption keys must contain 32 bytes.');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function encrypt(value: unknown) {
  const kid = env('TOKEN_ACTIVE_KEY_ID');
  if (kid && !/^[a-zA-Z0-9_-]{1,60}$/.test(kid))
    throw new Error('Invalid active encryption key ID');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      ...(kid ? { additionalData: enc.encode(kid) } : {}),
    },
    await encryptionKey(kid || undefined),
    enc.encode(JSON.stringify(value)),
  );
  return (
    (kid ? kid + '.' : '') +
    btoa(String.fromCharCode(...iv)) +
    '.' +
    btoa(String.fromCharCode(...new Uint8Array(data)))
  );
}
export async function decrypt<T = Record<string, unknown>>(
  value: string,
): Promise<T> {
  const segments = value.split('.');
  if (![2, 3].includes(segments.length))
    throw new Error('Invalid credential envelope');
  const kid = segments.length === 3 ? segments.shift()! : undefined;
  const [iv, data] = segments.map((x) =>
    Uint8Array.from(atob(x), (c) => c.charCodeAt(0)),
  );
  const raw = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      ...(kid ? { additionalData: enc.encode(kid) } : {}),
    },
    await encryptionKey(kid),
    data,
  );
  return JSON.parse(new TextDecoder().decode(raw));
}
export async function sign(body: string, secret: string) {
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(body))),
    (x) => x.toString(16).padStart(2, '0'),
  ).join('');
}
export async function verifySignature(
  body: string,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const bytes = Uint8Array.from(signature.match(/../g)!, (x) =>
    parseInt(x, 16),
  );
  return crypto.subtle.verify('HMAC', k, bytes, enc.encode(body));
}
