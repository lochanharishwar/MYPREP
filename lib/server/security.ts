import 'server-only';
import { required, env } from './env';
import { normalizeUrl } from '../domain';
import { boundedBytes } from './http';
import { isPublicAddress, isPublicWebUrl } from './public-address';

export async function validatePublicUrl(raw: string) {
  if (!isPublicWebUrl(raw)) throw new Error('Use a public HTTP or HTTPS website domain without credentials or custom ports.');
  const url = normalizeUrl(raw);
  const host = new URL(url).hostname.replace(/\.$/, '');
  const answers = await Promise.all(['A', 'AAAA'].map(async (type) => {
    const response = await fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(host) + '&type=' + type, {
      redirect: 'error',
      headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Unable to verify the website address. Retry when DNS is reachable.');
    }
    const result = JSON.parse(new TextDecoder().decode(await boundedBytes(response, 64000)));
    if (!result || result.Status !== 0 || (result.Answer !== undefined && !Array.isArray(result.Answer)))
      throw new Error('The website domain could not be resolved. Check its address.');
    return result.Answer ?? [];
  }));
  let resolved = false;
  for (const answer of answers.flat()) {
    if (!answer || typeof answer !== 'object') throw new Error('Invalid DNS response.');
    if (answer.type === 1 || answer.type === 28) {
      if (typeof answer.data !== 'string' || !isPublicAddress(answer.data) ||
        (answer.type === 1 ? answer.data.includes(':') : !answer.data.includes(':')))
        throw new Error('Private, reserved or invalid network addresses cannot be crawled.');
      resolved = true;
    }
  }
  if (!resolved) throw new Error('The website has no public address. Check its domain.');
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
