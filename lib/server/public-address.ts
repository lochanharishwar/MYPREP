/** Conservative Internet-address checks. These do not pin a socket's DNS result. */
export function isPublicAddress(address: string): boolean {
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(address)) {
    const [a, b, c, d] = address.split('.').map(Number);
    if ([a, b, c, d].some((part) => part > 255)) return false;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && ((b === 0 && (c === 0 || c === 2)) ||
        (b === 88 && c === 99) || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  // URL validates and canonicalizes compressed IPv6. Reject dotted/mapped,
  // translated and tunnel addresses rather than treating their text as global.
  if (!/^[0-9a-f:]+$/i.test(address) || !address.includes(':')) return false;
  try {
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const [left, right] = normalized.split('::');
    const head = left ? left.split(':') : [];
    const tail = right ? right.split(':') : [];
    const words = right === undefined ? head : [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail];
    if (words.length !== 8) return false;
    const values = words.map((word) => Number.parseInt(word, 16));
    if (values[0] < 0x2000 || values[0] > 0x3fff) return false;
    return !((values[0] === 0x2001 && (values[1] < 0x200 || values[1] === 0xdb8)) ||
      values[0] === 0x2002 || (values[0] === 0x3fff && values[1] < 0x1000));
  } catch { return false; }
}

/** Self-contained so the same literal-host guard can run in Browserless. */
export function isPublicWebUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      (!url.port || ['80', '443'].includes(url.port)) && host.length <= 253 &&
      host.includes('.') && !host.includes(':') && !/^\d+(\.\d+){3}$/.test(host) &&
      !['localhost', 'local', 'internal', 'test', 'home.arpa'].some((suffix) => host === suffix || host.endsWith('.' + suffix)) &&
      host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  } catch { return false; }
}
