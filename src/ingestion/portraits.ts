import type { Member } from '../core/types';
import type { SourceCapture } from '../core/publication';
import { bioguide, publishablePortrait, type Portrait } from './members';

function format(bytes: Uint8Array, contentType: string): 'jpg' | 'png' | 'webp' {
  const starts = (...signature: number[]) => signature.every((n,i) => bytes[i] === n);
  if (contentType === 'image/jpeg' && starts(0xff,0xd8,0xff) && bytes.length > 4 && bytes[bytes.length-2] === 0xff && bytes[bytes.length-1] === 0xd9) return 'jpg';
  if (contentType === 'image/png' && starts(137,80,78,71,13,10,26,10) && bytes.length >= 33) return 'png';
  if (contentType === 'image/webp' && starts(82,73,70,70) && bytes.length >= 20 && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'webp';
  throw new Error('Portrait must have matching PNG, JPEG, or WebP MIME and file signature');
}

export async function cachePortrait(manifest: Portrait, fetcher: typeof fetch = fetch, now = new Date().toISOString()): Promise<{
  memberId: string; filename: string; bytes: Uint8Array; portrait: NonNullable<Member['portrait']>; source: SourceCapture;
}> {
  const memberId = bioguide(manifest.memberId);
  if (!publishablePortrait(manifest)) throw new Error('Portrait requires explicit rights evidence, attribution, and reviewer');
  const url = new URL(manifest.url);
  if (!['congress.gov','house.gov','senate.gov'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) || url.username || url.password || url.search || url.hash) throw new Error('Portrait source must be an official congressional HTTPS host without credentials or query');
  if (!Number.isFinite(Date.parse(now))) throw new Error('Invalid portrait capture time');
  const response = await fetcher(url.toString(), { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { Accept: 'image/png,image/jpeg,image/webp' } });
  if (!response.ok || !response.body) throw new Error(`Portrait source failed: HTTP ${response.status}`);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 5_000_000) throw new Error('Portrait exceeds 5 MB size limit');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const extension = format(bytes, (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,'0')).join('');
  const filename = `${memberId}-${sha256}.${extension}`;
  return { memberId, filename, bytes, source: { url: url.toString(), sha256, retrievedAt: now, kind: 'portrait' },
    portrait: { url: `/scorecard/portraits/${filename}`, attribution: manifest.attribution,
      rights: manifest.rights as 'public-domain' | 'licensed', rightsSource: manifest.rightsSource!, reviewedBy: manifest.reviewedBy! } };
}
