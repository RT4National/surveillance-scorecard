import type { Dataset, SourceCapture } from '../core/publication';
import type { Member, Party } from '../core/types';

export interface DatedAffiliation {
  memberId: string;
  kind: 'party' | 'committee' | 'caucus' | 'term';
  name: string;
  start: string;
  end?: string;
  precision: 'day' | 'year';
  source: string;
}
export interface Portrait {
  memberId: string;
  url: string;
  attribution: string;
  rights: 'unreviewed' | 'public-domain' | 'licensed';
  rightsSource?: string;
  reviewedBy?: string;
}
export interface RosterRun {
  complete: true;
  asOf: string;
  expectedCount: number;
  members: Member[];
  sources: SourceCapture[];
  affiliations: DatedAffiliation[];
  portraits: Portrait[];
  warnings: string[];
}
type JsonObject = Record<string, unknown>;
export function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as JsonObject;
}
export function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Expected nonempty string');
  return value.trim();
}
export function bioguide(value: unknown): string {
  const id = requiredString(value).toUpperCase();
  if (!/^[A-Z]\d{6}$/.test(id)) throw new Error('Invalid Bioguide identifier');
  return id;
}
export function party(value: unknown): Party {
  switch (value) {
    case 'D': case 'Democrat': case 'Democratic': return 'Democratic';
    case 'R': case 'Republican': return 'Republican';
    case 'I': case 'Independent': return 'Independent';
    default: throw new Error('Unsupported party requires explicit schema/editorial review');
  }
}
export async function capture(text: string, url: string, kind: SourceCapture['kind'], retrievedAt: string): Promise<SourceCapture> {
  const clean = new URL(url);
  if (clean.protocol !== 'https:' || !Number.isFinite(Date.parse(retrievedAt))) throw new Error('Capture requires an HTTPS source and valid retrieval time');
  for (const key of [...clean.searchParams.keys()]) if (['api_key','key'].includes(key.toLowerCase())) clean.searchParams.delete(key);
  clean.username = ''; clean.password = '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return { url: clean.toString(), retrievedAt, kind, sha256: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('') };
}

export async function readSource(response: Response, maxBytes = 2_000_000): Promise<string> {
  if (!response.body) throw new Error('Empty source response');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new Error('Source response exceeds size limit');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

/** Strict current-roster import. Any failed or inconsistent page rejects the entire run. */
export async function ingestCurrentMembers(options: { apiKey: string; fetcher?: typeof fetch; now?: string; maxPages?: number }): Promise<RosterRun> {
  if (!options.apiKey.trim()) throw new Error('CONGRESS_API_KEY is required');
  const fetcher = options.fetcher ?? fetch;
  const asOf = options.now ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(asOf))) throw new Error('Invalid capture date');
  const members: Member[] = [], sources: SourceCapture[] = [], affiliations: DatedAffiliation[] = [], portraits: Portrait[] = [];
  const seen = new Set<string>(), pages = new Set<string>();
  let next: string | undefined = 'https://api.congress.gov/v3/member?currentMember=true&format=json&limit=250&offset=0';
  let expectedCount: number | undefined;
  while (next) {
    const url: URL = new URL(next);
    if (url.origin !== 'https://api.congress.gov' || url.pathname !== '/v3/member' || url.username || url.password) throw new Error('Untrusted pagination URL');
    url.searchParams.set('currentMember', 'true'); url.searchParams.set('format', 'json'); url.searchParams.delete('api_key');
    const publicUrl = url.toString();
    if (pages.has(publicUrl) || pages.size >= (options.maxPages ?? 20)) throw new Error('Pagination loop or page limit');
    pages.add(publicUrl);
    // Credentials are carried in a header, never source URLs or error messages.
    const response = await fetcher(publicUrl, { headers: { 'X-Api-Key': options.apiKey, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Congress member import failed: HTTP ${response.status}`);
    const raw = await readSource(response);
    const data = object(JSON.parse(raw)), pagination = object(data.pagination);
    const count = pagination.count;
    if (!Number.isSafeInteger(count) || Number(count) < 1 || (expectedCount !== undefined && expectedCount !== count)) throw new Error('Roster count absent or changed during import');
    expectedCount = Number(count);
    if (!Array.isArray(data.members) || !data.members.length) throw new Error('Empty roster page');
    sources.push(await capture(raw, publicUrl, 'members', asOf));
    for (const item of data.members) {
      const row = object(item), id = bioguide(row.bioguideId);
      if (seen.has(id)) throw new Error(`Duplicate member ${id}; retry a stable roster run`);
      seen.add(id);
      const terms = object(row.terms).item;
      if (!Array.isArray(terms) || !terms.length) throw new Error(`Missing terms for ${id}`);
      const sorted = terms.map(object).sort((a,b) => Number(a.startYear) - Number(b.startYear));
      const latest = sorted[sorted.length - 1];
      const chamber = latest.chamber === 'Senate' ? 'Senate' : latest.chamber === 'House of Representatives' ? 'House' : undefined;
      if (!chamber || !Number.isInteger(latest.startYear)) throw new Error(`Invalid current term for ${id}`);
      if (row.district !== undefined && (!Number.isInteger(row.district) || Number(row.district) < 0)) throw new Error(`Invalid district for ${id}`);
      members.push({ id, name: requiredString(row.name), party: party(row.partyName), state: requiredString(row.state), chamber,
        ...(chamber === 'House' && row.district !== undefined ? { district: Number(row.district) } : {}),
        status: 'active', committees: [], caucuses: [], since: Number(latest.startYear) });
      for (const term of sorted) {
        if (!Number.isInteger(term.startYear) || (term.endYear !== undefined && (!Number.isInteger(term.endYear) || Number(term.endYear) < Number(term.startYear)))) throw new Error(`Invalid term interval for ${id}`);
        affiliations.push({ memberId: id, kind: 'term', name: requiredString(term.chamber), start: String(term.startYear), ...(term.endYear === undefined ? {} : { end: String(term.endYear) }), precision: 'year', source: publicUrl });
      }
      if (row.depiction) {
        const depiction = object(row.depiction);
        if (depiction.imageUrl) portraits.push({ memberId: id, url: requiredString(depiction.imageUrl), attribution: typeof depiction.attribution === 'string' ? depiction.attribution : '', rights: 'unreviewed' });
      }
    }
    next = pagination.next === undefined || pagination.next === null ? undefined : requiredString(pagination.next);
  }
  if (members.length !== expectedCount) throw new Error('Partial roster refused: returned count does not match advertised count');
  return { complete: true, asOf, expectedCount, members, sources, affiliations, portraits,
    warnings: ['Current roster only; historical members and exact party-change dates require supplemental reviewed sources.', 'Committee and caucus memberships are not supplied by this import.', 'Portrait attribution is retained; publication requires separate rights review.'] };
}

export function publishablePortrait(portrait: Portrait): boolean {
  try {
    return new URL(portrait.url).protocol === 'https:' && portrait.attribution.trim().length > 0 &&
      (portrait.rights === 'public-domain' || portrait.rights === 'licensed') && !!portrait.reviewedBy?.trim() &&
      new URL(portrait.rightsSource ?? '').protocol === 'https:';
  } catch { return false; }
}

/** Missing records stay intact until an editor verifies retirement, vacancy, or death. */
export function reconcileRoster(previous: Dataset, run: RosterRun): { dataset: Dataset; missingMemberIds: string[]; requiresReview: true } {
  if (run.complete !== true || run.expectedCount !== run.members.length || !run.members.length || new Set(run.members.map(m => m.id)).size !== run.members.length || !run.sources.length) throw new Error('Incomplete roster cannot be staged');
  const incoming = new Map(run.members.map(m => [m.id, m]));
  const missingMemberIds = previous.members.filter(m => m.status === 'active' && !incoming.has(m.id)).map(m => m.id);
  const existing = new Map(previous.members.map(m => [m.id, m]));
  for (const member of run.members) {
    const old = existing.get(member.id);
    existing.set(member.id, { ...old, ...member, committees: old?.committees ?? [], caucuses: old?.caucuses ?? [] });
  }
  const affiliationKey = (row: DatedAffiliation) => JSON.stringify([row.memberId, row.kind, row.name, row.start, row.end ?? null, row.precision]);
  const affiliations = [...new Map([...(previous.affiliations ?? []), ...run.affiliations].map(row => [affiliationKey(row), row])).values()];
  return { requiresReview: true, missingMemberIds, dataset: { ...previous, id: `staging-${crypto.randomUUID()}`, asOf: run.asOf.slice(0,10),
    members: [...existing.values()], affiliations, sources: [...previous.sources, ...run.sources],
    coverage: [...previous.coverage, ...run.warnings, ...(missingMemberIds.length ? [`Roster reconciliation: ${missingMemberIds.length} previously active members were absent and retained pending review.`] : [])] } };
}
