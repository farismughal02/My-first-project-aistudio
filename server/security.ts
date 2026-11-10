import { createHash, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import https from 'node:https';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) blocked.addSubnet(address, prefix, 'ipv4');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4') :
    family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function validateFeedUrl(value: unknown, allowedHosts: Set<string>): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid feed URL.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !allowedHosts.has(url.hostname.toLowerCase()) || isIP(url.hostname.replace(/[\[\]]/g, ''))) {
    throw new Error('Use an HTTPS URL on an approved feed host.');
  }
  url.hash = '';
  return url;
}

// Resolve once, reject non-public answers, and pin the connection to that answer.
// Redirects pass through the same checks. A timer and byte limit cover the body too.
export async function downloadFeed(value: string, allowedHosts: Set<string>, signal = AbortSignal.timeout(5000), redirects = 0): Promise<string> {
  const url = validateFeedUrl(value, allowedHosts);
  signal.throwIfAborted();
  const addresses = await new Promise<Awaited<ReturnType<typeof lookup>>[]>((resolve, reject) => {
    const aborted = () => reject(new Error('Feed lookup timed out.'));
    signal.addEventListener('abort', aborted, { once: true });
    lookup(url.hostname, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('Feed destination is not public.');
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      signal,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [selected]);
        else callback(null, selected.address, selected.family);
      },
      headers: { 'User-Agent': 'SentinelWire/1.0', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    }, (res) => {
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.destroy();
        if (!res.headers.location || redirects >= 3) return reject(new Error('Too many feed redirects.'));
        try { resolve(downloadFeed(new URL(res.headers.location, url).href, allowedHosts, signal, redirects + 1)); }
        catch (error) { reject(error); }
        return;
      }
      if (res.statusCode !== 200) { res.destroy(); reject(new Error('Feed returned an error.')); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1_000_000) { res.destroy(new Error('Feed exceeds 1 MB.')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
  });
}

export function authorized(header: string | undefined, token: string): boolean {
  if (!token || !header?.startsWith('Bearer ') || header.length > 512) return false;
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(token));
}

export class RateLimiter {
  private buckets = new Map<string, { count: number; expires: number }>();
  constructor(private limit: number, private windowMs: number, private capacity = 2000) {}
  allow(key: string, now = Date.now()): boolean {
    for (const [id, bucket] of this.buckets) if (bucket.expires <= now) this.buckets.delete(id);
    const bucket = this.buckets.get(key);
    if (bucket) { if (bucket.count >= this.limit) return false; bucket.count++; return true; }
    if (this.buckets.size >= this.capacity) return false;
    this.buckets.set(key, { count: 1, expires: now + this.windowMs });
    return true;
  }
}
